import { personalPlan } from "./card-variants";
import { parseRun, type RunState } from "./run-state";
import { createHash, randomBytes } from "node:crypto";
import { rpc, StorageError } from "./db";
import { LessonPlanSchema, type LessonPlan } from "./schema";

/**
 * Хранение уроков и учеников. Здесь только «что сохранить и что прочитать»;
 * права проверяет сама база (supabase/schema.sql).
 *
 * Учитель без регистрации: при создании урока сервер выдаёт случайный ключ учителя.
 * Браузер учителя хранит его у себя, а база знает только SHA-256 от ключа.
 * С ключом можно править урок и видеть учеников; по одной ссылке урок можно только посмотреть.
 */

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isJoinCode = (value: string) => /^\d{6}$/.test(value);

export function newTeacherToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SavedLesson = { id: string; joinCode: string; token: string };

/** token: ключ учителя, если он уже выдан (сборка урока выдаёт его заранее, и тот же ключ становится ключом урока). */
export async function saveLesson(
  plan: LessonPlan,
  isDemo = false,
  token = newTeacherToken(),
): Promise<SavedLesson> {
  const rows = await rpc<{ id: string; join_code: string }[]>("create_lesson", {
    p_plan: plan,
    p_language: plan.language,
    p_token_hash: hashToken(token),
    p_demo: isDemo,
  });
  const row = rows[0];
  if (!row) throw new StorageError(500);
  return { id: row.id, joinCode: row.join_code, token };
}

export type StoredLesson = {
  id: string;
  plan: LessonPlan;
  joinCode: string;
  isDemo: boolean;
  updatedAt: string;
};

/** Урок из базы. План ещё раз проходит Zod: в базе он мог остаться от старой версии схемы. */
export async function getLesson(id: string): Promise<StoredLesson | null> {
  if (!isUuid(id)) return null;
  const rows = await rpc<
    { plan: unknown; join_code: string; is_demo: boolean; updated_at: string }[]
  >("get_lesson", { p_id: id });
  const row = rows[0];
  if (!row) return null;
  const plan = LessonPlanSchema.safeParse(row.plan);
  if (!plan.success) return null;
  return {
    id,
    plan: plan.data,
    joinCode: row.join_code,
    isDemo: row.is_demo,
    updatedAt: row.updated_at,
  };
}

export async function findLessonByCode(
  code: string,
): Promise<{ id: string; plan: LessonPlan } | null> {
  if (!isJoinCode(code)) return null;
  const rows = await rpc<{ id: string; plan: unknown }[]>(
    "find_lesson_by_code",
    { p_code: code },
  );
  const row = rows[0];
  const plan = row ? LessonPlanSchema.safeParse(row.plan) : null;
  return row && plan?.success ? { id: row.id, plan: plan.data } : null;
}

export async function isTeacher(id: string, token: string): Promise<boolean> {
  if (!isUuid(id) || !token) return false;
  return rpc<boolean>("check_teacher", {
    p_id: id,
    p_token_hash: hashToken(token),
  });
}

export async function updateLesson(
  id: string,
  token: string,
  plan: LessonPlan,
): Promise<boolean> {
  return rpc<boolean>("update_lesson", {
    p_id: id,
    p_token_hash: hashToken(token),
    p_plan: plan,
  });
}

export type SessionRow = {
  id: string;
  group_id: string;
  display_name: string;
  progress: unknown;
  current_card: string | null;
  hints_used: number;
  needs_help: boolean;
  help_card: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSessions(
  id: string,
  token: string,
): Promise<SessionRow[]> {
  return rpc<SessionRow[]>("lesson_sessions", {
    p_id: id,
    p_token_hash: hashToken(token),
  });
}

export async function clearHelp(
  id: string,
  token: string,
  sessionId: string,
): Promise<boolean> {
  return rpc<boolean>("clear_help", {
    p_id: id,
    p_token_hash: hashToken(token),
    p_session: sessionId,
  });
}

export async function createSession(
  lessonId: string,
  groupId: string,
  name: string,
): Promise<string> {
  return rpc<string>("create_session", {
    p_lesson: lessonId,
    p_group: groupId,
    p_name: name,
  });
}

export type StoredSession = {
  ownNumbers?: boolean;
  lessonId: string;
  plan: LessonPlan;
  groupId: string;
  name: string;
  progress: unknown;
  currentCard: string | null;
  needsHelp: boolean;
  helpCard: string | null;
  run?: RunState | null;
};

export async function getSession(
  sessionId: string,
): Promise<StoredSession | null> {
  if (!isUuid(sessionId)) return null;
  const rows = await rpc<
    {
      lesson_id: string;
      plan: unknown;
      group_id: string;
      display_name: string;
      progress: unknown;
      current_card: string | null;
      needs_help: boolean;
      help_card: string | null;
      started_at?: string | null;
      paused_at?: string | null;
    }[]
  >(process.env.RUN_SYNC === "on" ? "get_session_with_run" : "get_session", {
    p_session: sessionId,
  });
  const row = rows[0];
  if (!row) return null;
  const plan = LessonPlanSchema.safeParse(row.plan);
  if (!plan.success) return null;
  return {
    lessonId: row.lesson_id,
    ownNumbers: plan.data.numberVariants !== false && plan.data.groups.find((g) => g.id === row.group_id)?.cards.some((c) => !!c.variant),
    plan: personalPlan(plan.data, sessionId),
    groupId: row.group_id,
    name: row.display_name,
    progress: row.progress,
    currentCard: row.current_card,
    needsHelp: row.needs_help,
    helpCard: row.help_card,
    run: row.started_at
      ? parseRun(
          JSON.stringify({
            startedAt: Date.parse(row.started_at),
            pausedAt: row.paused_at ? Date.parse(row.paused_at) : null,
          }),
        )
      : null,
  };
}

/** null в поле значит «не менять». */
export async function updateSession(
  sessionId: string,
  change: {
    cardId?: string;
    cardState?: unknown;
    currentCard?: string;
    needsHelp?: boolean;
    helpCard?: string | null;
  },
): Promise<boolean> {
  return rpc<boolean>("update_session", {
    p_session: sessionId,
    p_card: change.cardId && change.cardState ? change.cardId : null,
    p_card_state: change.cardState ?? null,
    p_current_card: change.currentCard ?? null,
    p_needs_help: change.needsHelp ?? null,
    p_help_card: change.helpCard ?? null,
  });
}

// ---------------------------------------------------------------------------
// Сборка урока: номер сразу, урок в фоне, браузер спрашивает статус (supabase/schema.sql, lesson_jobs)

export type JobStatus = "running" | "ready" | "failed";
export type StoredJob = {
  status: JobStatus;
  progress: unknown;
  lessonId: string | null;
  joinCode: string | null;
  error: string | null;
  updatedAt: string;
  createdAt: string;
};

export async function createJob(
  token: string,
  progress: unknown,
): Promise<string> {
  const id = await rpc<string>("create_job", {
    p_token_hash: hashToken(token),
    p_progress: progress,
  });
  if (typeof id !== "string") throw new StorageError(500);
  return id;
}

/** null в поле значит «не менять». */
export async function updateJob(
  id: string,
  token: string,
  change: {
    status?: JobStatus;
    progress?: unknown;
    lessonId?: string;
    error?: string;
  },
): Promise<boolean> {
  return rpc<boolean>("update_job", {
    p_id: id,
    p_token_hash: hashToken(token),
    p_status: change.status ?? null,
    p_progress: change.progress ?? null,
    p_lesson_id: change.lessonId ?? null,
    p_error: change.error ?? null,
  });
}

export async function getJob(
  id: string,
  token: string,
): Promise<StoredJob | null> {
  if (!isUuid(id) || !token) return null;
  const rows = await rpc<
    {
      status: JobStatus;
      progress: unknown;
      lesson_id: string | null;
      join_code: string | null;
      error: string | null;
      updated_at: string;
      created_at: string;
    }[]
  >("get_job", { p_id: id, p_token_hash: hashToken(token) });
  const row = rows[0];
  return row
    ? {
        status: row.status,
        progress: row.progress,
        lessonId: row.lesson_id,
        joinCode: row.join_code,
        error: row.error,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
      }
    : null;
}

export async function getLessonRun(id: string): Promise<RunState | null> {
  const rows = await rpc<
    { started_at: string | null; paused_at: string | null }[]
  >("get_lesson_run", { p_id: id });
  const r = rows[0];
  return r?.started_at
    ? parseRun(
        JSON.stringify({
          startedAt: Date.parse(r.started_at),
          pausedAt: r.paused_at ? Date.parse(r.paused_at) : null,
        }),
      )
    : null;
}
export async function setLessonRun(
  id: string,
  token: string,
  run: RunState | null,
): Promise<boolean> {
  return rpc<boolean>("set_run", {
    p_id: id,
    p_token_hash: hashToken(token),
    p_started_at:
      run?.startedAt != null ? new Date(run.startedAt).toISOString() : null,
    p_paused_at:
      run?.pausedAt != null ? new Date(run.pausedAt).toISOString() : null,
  });
}
