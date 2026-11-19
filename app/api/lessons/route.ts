import { demoLesson } from "@/lib/demo";
import { LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson, GenerationError } from "@/lib/ai";
import { fail, readJson } from "@/lib/api";
import { storageConfigured } from "@/lib/db";
import { checkDailyCap, checkLimit, clientIp, dailyLimited, limited } from "@/lib/rate-limit";
import { saveLesson } from "@/lib/store";

export const maxDuration = 300;

/**
 * POST: создать урок. Модель пишет урок (lib/ai.ts), сервер сохраняет его в базу и отдаёт
 * ссылку, код для учеников и ключ учителя. Если база не подключена или недоступна,
 * урок всё равно отдаётся, и браузер показывает его из вкладки (без ссылки и кода).
 */
export async function POST(request: Request) {
  const retryAfter = await checkLimit("lesson", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  // До ~4 МБ: фото страниц учебника (по 2 на класс, сжатые в браузере). Vercel принимает тело до 4,5 МБ.
  const body = await readJson(request, 4_200_000);
  if (body instanceof Response) return body;
  const parsed = LessonRequestSchema.safeParse(body);
  if (!parsed.success) return fail("bad_request", 400);

  const demo = process.env.DEMO_MODE === "true";
  if (!demo) {
    const untilTomorrow = await checkDailyCap("lesson");
    if (untilTomorrow) return dailyLimited(untilTomorrow);
  }
  let plan;
  try {
    plan = demo ? demoLesson : await generateLesson(parsed.data);
  } catch (error) {
    const code = error instanceof GenerationError ? error.code : "provider";
    return fail(code, code === "not_configured" ? 503 : 502);
  }

  if (storageConfigured()) {
    try {
      return Response.json({ plan, demo, ...(await saveLesson(plan, demo)) });
    } catch {
      // база недоступна: урок не теряем, отдаём без ссылки
    }
  }
  return Response.json({ plan, demo });
}
