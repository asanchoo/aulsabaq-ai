import { demoFor } from "@/lib/demo";
import { LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson, GenerationError } from "@/lib/ai";
import { fail, readJson } from "@/lib/api";
import { storageConfigured } from "@/lib/db";
import { checkDailyCap, checkLimit, clientIp, dailyLimited, limited } from "@/lib/rate-limit";
import { createJob, newTeacherToken, saveLesson, updateJob } from "@/lib/store";
import { initialProgress, type LessonProgress } from "@/lib/progress";
import type { LessonRequest } from "@/lib/generation-schema";
import { after } from "next/server";

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
  // С базой урок собирается в фоне: учитель сразу получает номер сборки и видит настоящий ход, а если связь
  // оборвётся, вернётся к той же сборке. Без базы (локальный запуск) — как раньше, одним ответом.
  if (!demo && storageConfigured()) {
    const token = newTeacherToken();
    const input = parsed.data;
    let jobId: string | null = null;
    try {
      jobId = await createJob(token, initialProgress(input.groups.length));
    } catch {
      // база недоступна: собираем урок одним ответом, как раньше
    }
    if (jobId) {
      const id = jobId;
      after(() => buildInBackground(id, token, input));
      return Response.json({ job: id, token });
    }
  }

  let plan;
  try {
    plan = demo ? demoFor(parsed.data.language) : await generateLesson(parsed.data);
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

/**
 * Сборка урока после ответа (after): этапы пишем в базу по очереди (промисы в цепочке, чтобы поздний этап
 * не затёрся ранним), в конце сохраняем урок с тем же ключом учителя и отмечаем сборку готовой.
 * Любая ошибка — сборка «failed» с кодом ошибки, учитель увидит понятный текст.
 */
async function buildInBackground(jobId: string, token: string, input: LessonRequest) {
  let queue: Promise<unknown> = Promise.resolve();
  let last: LessonProgress = initialProgress(input.groups.length);
  const write = (progress: LessonProgress) => {
    last = progress;
    queue = queue.then(() => updateJob(jobId, token, { progress })).catch(() => undefined);
  };
  try {
    const plan = await generateLesson(input, write);
    write({ ...last, stage: "save" });
    const saved = await saveLesson(plan, false, token);
    await queue;
    await updateJob(jobId, token, { status: "ready", lessonId: saved.id, progress: { ...last, stage: "done" } });
  } catch (error) {
    await queue;
    const code = error instanceof GenerationError ? error.code : "provider";
    await updateJob(jobId, token, { status: "failed", error: code }).catch(() => undefined);
  }
}
