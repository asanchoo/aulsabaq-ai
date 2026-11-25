import type { LessonPlan } from "./schema";
import type { CardStatus } from "./student";

export type StudentRow = {
  id: string;
  name: string;
  groupId: string;
  currentCard: string | null;
  needsHelp: boolean;
  helpCard: string | null;
  hintsUsed: number;
  trainerSolved?: number;
  updatedAt: string;
  helpRequestedAt?: string;
  cards: Record<
    string,
    {
      status: CardStatus;
      attempts: number;
      hints: number;
      lastAnswer: string | null;
    }
  >;
};
export type HelpItem = {
  id: string;
  groupId: string;
  studentId?: string;
  name?: string;
  peer?: { id: string; name: string; grade: number };
  cardId: string;
  reason: "requested" | "attempts" | "idle" | "class_stuck";
  waitMinutes: number;
  availableIn: number | null;
  count: number;
  total: number;
};

/** null means no individual help slot remains in the timetable. */
export function availableIn(
  plan: LessonPlan,
  groupId: string,
  minute?: number,
): number | null {
  if (minute === undefined) return null;
  for (let at = Math.max(0, Math.floor(minute)); at < plan.durationMin; at++) {
    const segments = plan.timeline.filter(
      (s) => s.startMin <= at && at < s.endMin,
    );
    if (segments.some((s) => s.mode === "joint")) continue;
    const teacher = segments.find((s) => s.mode === "with_teacher");
    if (!teacher || teacher.groupId === groupId) return at - Math.floor(minute);
  }
  return null;
}

/** No network, model or mutable clock: same pupils, plan and time give the same queue. */
export function buildHelpQueue(
  students: StudentRow[],
  plan: LessonPlan,
  now: number,
  minute?: number,
): HelpItem[] {
  const out: (HelpItem & { priority: number; since: number })[] = [];
  const stamp = (s: string) =>
    Number.isFinite(Date.parse(s)) ? Math.min(now, Date.parse(s)) : now;
  for (const group of plan.groups) {
    const own = students.filter((s) => s.groupId === group.id);
    const cards = [...group.cards, ...(group.extraCards ?? [])];
    const access = availableIn(plan, group.id, minute);
    for (const s of own) {
      const cardId = s.needsHelp
        ? (s.helpCard ?? s.currentCard)
        : s.currentCard;
      if (!cardId || !cards.some((c) => c.id === cardId)) continue;
      const state = s.cards[cardId];
      const requested = s.needsHelp;
      const since = stamp(
        requested ? (s.helpRequestedAt ?? s.updatedAt) : s.updatedAt,
      );
      const waitMinutes = Math.floor((now - since) / 60_000);
      const independent =
        minute !== undefined &&
        plan.timeline.some(
          (seg) =>
            seg.groupId === group.id &&
            seg.startMin <= minute &&
            minute < seg.endMin &&
            seg.mode === "independent",
        );
      const reason = requested
        ? "requested"
        : state?.status === "todo" && state.attempts >= 3
          ? "attempts"
          : independent &&
              (!state || state.status === "todo") &&
              waitMinutes >= 4
            ? "idle"
            : null;
      if (reason)
        out.push({
          id: `student-${s.id}`,
          groupId: group.id,
          studentId: s.id,
          name: s.name,
          cardId,
          reason,
          waitMinutes,
          availableIn: access,
          count: 1,
          total: own.length,
          since,
          priority:
            reason === "requested" ? 100 : reason === "attempts" ? 70 : 40,
        });
    }
    for (const card of group.cards) {
      const stuck = own.filter((s) => {
        const c = s.cards[card.id];
        return (
          (s.needsHelp && s.helpCard === card.id) ||
          (c?.status === "todo" && (c.attempts >= 3 || c.hints >= 3)) ||
          c?.status === "self_wrong"
        );
      });
      if (stuck.length >= 2 && stuck.length * 2 >= own.length) {
        out.push({
          id: `class-${group.id}-${card.id}`,
          groupId: group.id,
          cardId: card.id,
          reason: "class_stuck",
          waitMinutes: 0,
          availableIn: access,
          count: stuck.length,
          total: own.length,
          priority: 90,
          since: now,
        });
      }
    }
  }
  const assigned = new Set<string>();
  return out
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.since - b.since ||
        a.id.localeCompare(b.id),
    )
    .map(({ priority, since, ...item }) => {
      void priority;
      void since;
      const younger = plan.groups.find((g) => g.id === item.groupId);
      if (!item.studentId || !younger || minute === undefined) return item;
      // A finished pupil may be suggested once, only while their own class works independently.
      const helper = students
        .filter((student) => {
          const older = plan.groups.find((g) => g.id === student.groupId);
          return (
            older &&
            older.grade > younger.grade &&
            older.cards.length > 0 &&
            !assigned.has(student.id) &&
            !student.needsHelp &&
            older.cards.every((card) =>
              ["correct", "done", "self_correct"].includes(
                student.cards[card.id]?.status,
              ),
            ) &&
            plan.timeline.some(
              (segment) =>
                segment.groupId === older.id &&
                segment.mode === "independent" &&
                segment.startMin <= minute &&
                minute < segment.endMin,
            )
          );
        })
        .sort((a, b) => {
          const grade = (id: string) =>
            plan.groups.find((g) => g.id === id)!.grade;
          return (
            grade(a.groupId) - grade(b.groupId) || a.id.localeCompare(b.id)
          );
        })[0];
      if (!helper) return item;
      assigned.add(helper.id);
      return {
        ...item,
        peer: {
          id: helper.id,
          name: helper.name,
          grade: plan.groups.find((g) => g.id === helper.groupId)!.grade,
        },
      };
    });
}
