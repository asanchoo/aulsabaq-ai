import type { LessonPlan } from "./schema";

/** Read the actual timetable, including repeat card blocks; never invent a second schedule for paper. */
export function classRoute(plan: LessonPlan, groupId: string) {
  const group = plan.groups.find((g) => g.id === groupId);
  if (!group) return [];
  return plan.timeline
    .filter((s) => s.groupId === groupId)
    .sort((a, b) => a.startMin - b.startMin)
    .map((s) => ({
      start: s.startMin,
      end: s.endMin,
      mode: s.mode,
      cards: (s.cardIds ?? [])
        .map((id) => group.cards.findIndex((c) => c.id === id) + 1)
        .filter((n) => n > 0),
    }));
}
