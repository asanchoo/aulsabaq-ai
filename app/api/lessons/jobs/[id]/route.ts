import { fail, storageFailure, teacherToken } from "@/lib/api";
import { initialProgress, type JobView, type LessonProgress } from "@/lib/progress";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getJob } from "@/lib/store";

/** Сервер пишет этап сборки не реже, чем раз в пару минут; дольше молчит — значит, остановился (лимит 300 с). */
const STALE_MS = 330_000;

/**
 * GET: как идёт сборка урока. Только с ключом учителя (тот же, что потом у урока): чужую сборку не увидеть.
 * Браузер спрашивает раз в несколько секунд, пока статус не «ready» или «failed».
 */
export async function GET(request: Request, ctx: RouteContext<"/api/lessons/jobs/[id]">) {
  const retryAfter = await checkLimit("teacher", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { id } = await ctx.params;
  try {
    const job = await getJob(id, teacherToken(request));
    if (!job) return fail("not_found", 404);
    const now = Date.now();
    const view: JobView = {
      status: job.status,
      progress: { ...initialProgress(0), ...(job.progress as Partial<LessonProgress>) },
      lessonId: job.lessonId,
      joinCode: job.joinCode,
      error: job.error,
      stale: job.status === "running" && now - Date.parse(job.updatedAt) > STALE_MS,
      elapsed: Math.max(0, Math.round((now - Date.parse(job.createdAt)) / 1000)),
    };
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storageFailure(error);
  }
}
