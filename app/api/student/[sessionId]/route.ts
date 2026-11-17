import { fail, readJson, storageFailure } from "@/lib/api";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getSession, updateSession } from "@/lib/store";
import { applyAction, findCard, readProgress, StudentActionSchema } from "@/lib/student";
import { studentView } from "@/lib/student-view";

/** GET: карточки ученика и его прогресс. */
export async function GET(request: Request, ctx: RouteContext<"/api/student/[sessionId]">) {
  const retryAfter = await checkLimit("student", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { sessionId } = await ctx.params;
  try {
    const session = await getSession(sessionId);
    const view = session && studentView(session);
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
export async function POST(request: Request, ctx: RouteContext<"/api/student/[sessionId]">) {
  const retryAfter = await checkLimit("student", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { sessionId } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = StudentActionSchema.safeParse(body);
  if (!parsed.success) return fail("bad_request", 400);
  const action = parsed.data;
  try {
    const session = await getSession(sessionId);
    if (!session) return fail("not_found", 404);
    const found = findCard(session.plan, session.groupId, action.cardId);
    if (!found) return fail("not_found", 404);

    let correct: boolean | undefined;
    if (action.action === "open") {
      await updateSession(sessionId, { currentCard: action.cardId });
    } else if (action.action === "help") {
      await updateSession(sessionId, { needsHelp: action.needsHelp, helpCard: action.cardId, currentCard: action.cardId });
    } else {
      const result = applyAction(found.card, readProgress(session.progress)[action.cardId], action);
      if (!result.ok) return fail(result.error, 409);
      correct = result.correct;
      await updateSession(sessionId, { cardId: action.cardId, cardState: result.state, currentCard: action.cardId });
    }
    const fresh = await getSession(sessionId);
    const view = fresh && studentView(fresh);
    if (!view) return fail("not_found", 404);
    return Response.json({ ...view, ...(correct !== undefined ? { correct } : {}) });
  } catch (error) {
    return storageFailure(error);
  }
}
