import { z } from "zod";
import { fail, readJson, storageFailure } from "@/lib/api";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { createSession, findLessonByCode } from "@/lib/store";
import { cleanName } from "@/lib/student";
import { groupLanguage } from "@/lib/schema";

/** GET ?code=123456: какой это урок и какие в нём классы (ученик выбирает свой). */
export async function GET(request: Request) {
  const retryAfter = await checkLimit("join", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const code = new URL(request.url).searchParams.get("code")?.replace(/\D/g, "") ?? "";
  try {
    const lesson = await findLessonByCode(code);
    if (!lesson) return fail("not_found", 404);
    return Response.json({
      subject: lesson.plan.subject,
      language: lesson.plan.language,
      // У каждого класса свой язык: ученик казахского класса попадёт на казахский экран.
      groups: lesson.plan.groups.map((g) => ({ id: g.id, grade: g.grade, topic: g.topic, language: groupLanguage(lesson.plan, g) })),
    });
  } catch (error) {
    return storageFailure(error);
  }
}

const JoinSchema = z.object({ code: z.string().max(10), groupId: z.string().max(10), name: z.string().max(80) });

/** POST: ученик входит в урок. Почты и телефона не спрашиваем, только имя или номер в списке. */
export async function POST(request: Request) {
  const retryAfter = await checkLimit("join", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = JoinSchema.safeParse(body);
  const name = parsed.success ? cleanName(parsed.data.name) : null;
  if (!parsed.success || !name) return fail("bad_request", 400);
  try {
    const lesson = await findLessonByCode(parsed.data.code.replace(/\D/g, ""));
    if (!lesson) return fail("not_found", 404);
    if (!lesson.plan.groups.some((g) => g.id === parsed.data.groupId)) return fail("bad_request", 400);
    const sessionId = await createSession(lesson.id, parsed.data.groupId, name);
    return Response.json({ sessionId });
  } catch (error) {
    return storageFailure(error);
  }
}
