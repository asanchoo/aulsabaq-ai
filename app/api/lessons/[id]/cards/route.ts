import { z } from "zod";
import { GenerationError, regenerateCard } from "@/lib/ai";
import { fail, readJson, storageFailure, teacherToken } from "@/lib/api";
import { StorageError } from "@/lib/db";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getLesson, isTeacher, updateLesson } from "@/lib/store";

export const maxDuration = 120;

const BodySchema = z.object({ cardId: z.string().max(20), wish: z.string().trim().max(200).optional() });

/**
 * POST: учитель просит заменить одну карточку («слишком сложно», «другое задание»).
 * Модель пишет новую карточку того же типа и назначения, она проходит те же проверки, что и урок,
 * и сразу сохраняется в уроке. Остальной урок не меняется.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/cards">) {
  const { id } = await ctx.params;
  const token = teacherToken(request);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("bad_request", 400);
  try {
    if (!(await isTeacher(id, token))) return fail("forbidden", 403);
    const retryAfter = await checkLimit("card", clientIp(request));
    if (retryAfter) return limited(retryAfter);
    const lesson = await getLesson(id);
    const group = lesson?.plan.groups.find((g) => g.cards.some((c) => c.id === parsed.data.cardId));
    if (!lesson || !group) return fail("not_found", 404);
    const card = await regenerateCard(lesson.plan, group.id, parsed.data.cardId, parsed.data.wish || undefined);
    // Перечитываем урок перед записью: пока модель думала, учитель мог сохранить другие правки.
    const fresh = await getLesson(id);
    if (!fresh) return fail("not_found", 404);
    const plan = {
      ...fresh.plan,
      groups: fresh.plan.groups.map((g) => g.id !== group.id ? g : { ...g, cards: g.cards.map((c) => (c.id === card.id ? card : c)) }),
    };
    if (!(await updateLesson(id, token, plan))) return fail("forbidden", 403);
    return Response.json({ card });
  } catch (error) {
    if (error instanceof GenerationError) return fail(error.code, error.code === "not_configured" ? 503 : 502);
    if (error instanceof StorageError) return storageFailure(error);
    throw error;
  }
}
