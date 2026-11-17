import { storageFailure } from "@/lib/api";
import { demoLesson } from "@/lib/demo";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { saveLesson } from "@/lib/store";

/**
 * POST: своя копия демо-урока с кодом для учеников, без вызова модели.
 * У каждого, кто нажал, отдельный урок: рецензенты не видят учеников друг друга.
 */
export async function POST(request: Request) {
  const retryAfter = await checkLimit("demo", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  try {
    return Response.json(await saveLesson(demoLesson, true));
  } catch (error) {
    return storageFailure(error);
  }
}
