import type { LessonPlan } from "./schema";
import type { StudentRow } from "./help-queue";

/** Deterministic browser-only simulation. Never persist these rows or pass their ids to the API. */
export function demoClass(
  plan: LessonPlan,
  seed: number,
  startedAt: number,
  elapsedSeconds: number,
): StudentRow[] {
  const elapsed = Math.max(0, Math.min(180, elapsedSeconds));
  const names = [
    "Айша",
    "Арман",
    "Дана",
    "Әли",
    "Мира",
    "Тимур",
    "Сара",
    "Аян",
    "Лина",
  ];
  const count = Math.max(6, Math.min(9, plan.groups.length * 3));
  return Array.from({ length: count }, (_, i) => {
    const group = plan.groups[i % plan.groups.length];
    const offset = ((seed >>> 0) + i * 7) % 13;
    const solved = Math.min(
      group.cards.length,
      Math.max(0, Math.floor((elapsed - offset) / (11 + (i % 3)))),
    );
    const difficult =
      (i === 0 || i === plan.groups.length) && elapsed >= 30 && elapsed < 120;
    const current = difficult
      ? Math.min(1, group.cards.length - 1)
      : Math.min(solved, group.cards.length - 1);
    const help = i === 0 && elapsed >= 45 && elapsed < 120;
    const stamp = new Date(
      startedAt + Math.floor(elapsed / 10) * 10_000,
    ).toISOString();
    const cards: StudentRow["cards"] = {};
    group.cards.forEach((c, n) => {
      if (n < current)
        cards[c.id] = {
          status: "correct",
          attempts: 1,
          hints: n % 3 === i % 3 ? 1 : 0,
          lastAnswer: c.answer ?? null,
        };
      if (n === current && elapsed > 10)
        cards[c.id] = {
          status: difficult
            ? "todo"
            : solved >= group.cards.length
              ? "correct"
              : "todo",
          attempts: difficult ? 3 : 1,
          hints: difficult ? 2 : 0,
          lastAnswer: difficult ? "0" : null,
        };
    });
    return {
      id: `demo-student-${i}`,
      name: names[i],
      groupId: group.id,
      currentCard: group.cards[current].id,
      needsHelp: help,
      helpCard: help ? group.cards[current].id : null,
      hintsUsed: Object.values(cards).reduce((sum, c) => sum + c.hints, 0),
      updatedAt: stamp,
      helpRequestedAt: help
        ? new Date(startedAt + 45_000).toISOString()
        : undefined,
      cards,
    };
  });
}
