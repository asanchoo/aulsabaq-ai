import { elapsedMs, type RunState } from "./run-state";
import type { LessonPlan, TaskCard } from "./schema";

function explanationEnd(plan: LessonPlan, groupId: string): number | undefined {
  return plan.timeline
    .filter((s) => s.groupId === groupId && s.mode === "with_teacher")
    .sort((a, b) => a.startMin - b.startMin)[0]?.endMin;
}

/** No wall-clock promise while paused, without a timer or without an explanation. */
export function practiceUnlockInMinutes(
  plan: LessonPlan,
  groupId: string,
  run: RunState | null,
  now: number,
): number | null {
  const end = explanationEnd(plan, groupId);
  if (!run || run.pausedAt !== null || end === undefined) return null;
  return Math.max(0, Math.ceil((end * 60000 - elapsedMs(run, now)) / 60000));
}
export function clockMinute(
  run: RunState | null,
  now: number,
): number | undefined {
  return run ? Math.floor(elapsedMs(run, now) / 60000) : undefined;
}
export function practiceUnlocked(
  plan: LessonPlan,
  groupId: string,
  run: RunState | null,
  now: number,
): boolean {
  if (!run) return true;
  const end = explanationEnd(plan, groupId);
  return end !== undefined && elapsedMs(run, now) >= end * 60000;
}
export function cardUnlocked(
  plan: LessonPlan,
  groupId: string,
  card: TaskCard,
  run: RunState | null,
  now: number,
): boolean {
  return card.purpose === "review" || practiceUnlocked(plan, groupId, run, now);
}
