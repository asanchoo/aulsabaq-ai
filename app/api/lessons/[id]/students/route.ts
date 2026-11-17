import { z } from "zod";
import { fail, readJson, storageFailure, teacherToken } from "@/lib/api";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { clearHelp, isUuid, listSessions } from "@/lib/store";
import { readProgress } from "@/lib/student";

/**
 * GET: ученики урока для панели учителя (страница опрашивает раз в 5 секунд).
 * Только с ключом учителя: имена учеников видит только тот, кто создал урок.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/lessons/[id]/students">) {
  const retryAfter = await checkLimit("teacher", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { id } = await ctx.params;
  const token = teacherToken(request);
  if (!isUuid(id) || !token) return fail("forbidden", 403);
  try {
    const rows = await listSessions(id, token);
    const students = rows.map((r) => {
      const progress = readProgress(r.progress);
      return {
        id: r.id,
        name: r.display_name,
        groupId: r.group_id,
        currentCard: r.current_card,
        needsHelp: r.needs_help,
        helpCard: r.help_card,
        hintsUsed: r.hints_used,
        updatedAt: r.updated_at,
        cards: Object.fromEntries(Object.entries(progress).map(([cardId, s]) => [
          cardId, { status: s.status, attempts: s.attempts, hints: s.hints, lastAnswer: s.lastAnswer ?? null },
        ])),
      };
    });
    return Response.json({ students }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storageFailure(error);
  }
}

const BodySchema = z.object({ action: z.literal("clear_help"), sessionId: z.string() });

/** POST: учитель подошёл к ученику и снимает флаг «нужна помощь». */
export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/students">) {
  const { id } = await ctx.params;
  const token = teacherToken(request);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || !isUuid(parsed.data.sessionId)) return fail("bad_request", 400);
  try {
    if (!(await clearHelp(id, token, parsed.data.sessionId))) return fail("forbidden", 403);
    return Response.json({ ok: true });
  } catch (error) {
    return storageFailure(error);
  }
}
