import { demoLesson } from "@/lib/demo";
import { LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson, GenerationError } from "@/lib/ai";
import { checkGenerationLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

export async function POST(request: Request) {
  // Only trust the platform-owned IP header; on other hosts use a conservative shared bucket.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") ?? "unknown" : "local";
  const retryAfter = checkGenerationLimit(ip);
  if (retryAfter) return Response.json({ error: "rate_limit" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "bad_request" }, { status: 413 });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 8192) return Response.json({ error: "bad_request" }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  const parsed = LessonRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ plan: demoLesson, demo: true });
  try {
    return Response.json({ plan: await generateLesson(parsed.data), demo: false });
  } catch (error) {
    const code = error instanceof GenerationError ? error.code : "provider";
    return Response.json({ error: code }, { status: code === "not_configured" ? 503 : 502 });
  }
}
