import { cardUnlocked, practiceUnlocked } from "@/lib/lesson-clock";
import { fail, readJson, storageFailure } from "@/lib/api";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getSession, updateSession } from "@/lib/store";
import {
  applyAction,
  applyTrainer,
  findCard,
  readProgress,
  StudentActionSchema,
  TrainerActionSchema,
  type TrainerAction,
} from "@/lib/student";
import { groupLanguage } from "@/lib/schema";
import { readTrainer, seededTask, TRAINER_KEY } from "@/lib/trainer";
import { studentView } from "@/lib/student-view";

/** GET: карточки ученика и его прогресс. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/student/[sessionId]">,
) {
  const retryAfter = await checkLimit("student", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { sessionId } = await ctx.params;
  try {
    const session = await getSession(sessionId);
    const view = session && studentView(session, sessionId);
    if (!view) return fail("not_found", 404);
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storageFailure(error);
  }
}

/**
 * POST: действие ученика. Ответ проверяет сервер (эталон в браузер не уходит),
 * правила в lib/student.ts. В ответ — обновлённый вид, чтобы экран ученика всегда совпадал с базой.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/student/[sessionId]">,
) {
  const retryAfter = await checkLimit("student", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { sessionId } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const trainerAction = TrainerActionSchema.safeParse(body);
  if (trainerAction.success) return trainer(sessionId, trainerAction.data);
  const parsed = StudentActionSchema.safeParse(body);
  if (!parsed.success) return fail("bad_request", 400);
  const action = parsed.data;
  try {
    const session = await getSession(sessionId);
    if (!session) return fail("not_found", 404);
    const found = findCard(session.plan, session.groupId, action.cardId);
    if (!found) return fail("not_found", 404);

    if (
      action.action !== "help" &&
      !cardUnlocked(
        session.plan,
        session.groupId,
        found.card,
        session.run ?? null,
        Date.now(),
      )
    )
      return fail("locked", 409);
    let correct: boolean | undefined;
    if (action.action === "open") {
      await updateSession(sessionId, { currentCard: action.cardId });
    } else if (action.action === "help") {
      await updateSession(sessionId, {
        needsHelp: action.needsHelp,
        helpCard: action.cardId,
        currentCard: action.cardId,
      });
    } else {
      const result = applyAction(
        found.card,
        readProgress(session.progress)[action.cardId],
        action,
      );
      if (!result.ok) return fail(result.error, 409);
      correct = result.correct;
      await updateSession(sessionId, {
        cardId: action.cardId,
        cardState: result.state,
        currentCard: action.cardId,
      });
    }
    const fresh = await getSession(sessionId);
    const view = fresh && studentView(fresh, sessionId);
    if (!view) return fail("not_found", 404);
    return Response.json({
      ...view,
      ...(correct !== undefined ? { correct } : {}),
    });
  } catch (error) {
    return storageFailure(error);
  }
}

/**
 * Тренажёр: сервер заново составляет текущее задание ученика (то же зерно и номер) и проверяет ответ.
 * Ответ уходит ученику, только когда попытки кончились или он нажал «Пропустить».
 */
async function trainer(sessionId: string, action: TrainerAction) {
  try {
    const session = await getSession(sessionId);
    const group = session?.plan.groups.find((g) => g.id === session.groupId);
    if (!session || !group) return fail("not_found", 404);
    if (
      !practiceUnlocked(session.plan, group.id, session.run ?? null, Date.now())
    )
      return fail("locked", 409);
    if (!group.trainer) return fail("bad_request", 400);
    const state = readTrainer(session.progress);
    const task = seededTask(
      group.trainer,
      sessionId,
      state.index,
      groupLanguage(session.plan, group),
    );
    const result = applyTrainer(state, task, action);
    await updateSession(sessionId, {
      cardId: TRAINER_KEY,
      cardState: result.state,
      currentCard: TRAINER_KEY,
    });
    const fresh = await getSession(sessionId);
    const view = fresh && studentView(fresh, sessionId);
    if (!view) return fail("not_found", 404);
    return Response.json({
      ...view,
      trainerResult: {
        correct: result.correct,
        shown: result.shown ?? null,
        prompt: task.prompt,
      },
    });
  } catch (error) {
    return storageFailure(error);
  }
}
