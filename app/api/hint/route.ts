import { z } from "zod";
import { generateHint } from "@/lib/ai";
import { fail, readJson, storageFailure } from "@/lib/api";
import { getDict, t } from "@/lib/i18n";
import { checkDailyCap, checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getSession, updateSession } from "@/lib/store";
import { emptyState, findCard, MAX_HINTS, readProgress } from "@/lib/student";

export const maxDuration = 60;

const BodySchema = z.object({ sessionId: z.string(), cardId: z.string().max(20) });

/**
 * POST: следующая подсказка ученику по карточке, не больше трёх.
 * 1-я — подсказка из урока (её уже проверили при создании урока, приходит мгновенно).
 * 2-я и 3-я — от ИИ с учётом последнего ответа ученика; guard отбрасывает подсказку с ответом.
 * Если ИИ недоступен, отдаём запасную подсказку из словаря: ученик не остаётся без помощи.
 */
export async function POST(request: Request) {
  const retryAfter = await checkLimit("hint", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("bad_request", 400);
  try {
    const session = await getSession(parsed.data.sessionId);
    if (!session) return fail("not_found", 404);
    const found = findCard(session.plan, session.groupId, parsed.data.cardId);
    if (!found) return fail("not_found", 404);
    const { group, card } = found;
    const state = readProgress(session.progress)[card.id] ?? emptyState();
    if (state.status !== "todo") return fail("finished", 409);
    if (state.hints >= MAX_HINTS) return fail("no_hints", 409);

    let hint: string | null = null;
    let source: "card" | "ai" | "fallback" = "card";
    if (state.hints === 0) {
      hint = card.hint;
    } else {
      // Общий суточный предел ИИ-подсказок исчерпан: ученик всё равно получает запасную подсказку.
      const aiAllowed = (await checkDailyCap("hint")) === 0;
      hint = aiAllowed ? await generateHint({
        language: session.plan.language, subject: session.plan.subject, grade: group.grade, topic: group.topic,
        card, studentAnswer: state.lastAnswer, previousHints: state.hintTexts,
      }) : null;
      source = hint ? "ai" : "fallback";
      if (!hint) {
        const fallback = getDict(session.plan.language).student.fallbackHints;
        hint = t(fallback[Math.min(state.hints - 1, fallback.length - 1)], { criteria: card.successCriteria });
      }
    }

    const next = { ...state, hints: state.hints + 1, hintTexts: [...state.hintTexts, hint] };
    await updateSession(parsed.data.sessionId, { cardId: card.id, cardState: next, currentCard: card.id });
    return Response.json({ hint, source, hintsLeft: MAX_HINTS - next.hints });
  } catch (error) {
    return storageFailure(error);
  }
}
