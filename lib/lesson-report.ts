import type { StudentRow } from "./help-queue";
import type { LessonPlan } from "./schema";
export type HelpRecord = {
  studentId: string;
  name: string;
  groupId: string;
  cardId: string;
};
export function lessonReport(
  plan: LessonPlan,
  students: StudentRow[],
  history: HelpRecord[] = [],
) {
  const help = [
    ...history,
    ...students
      .filter((s) => s.needsHelp && s.helpCard)
      .map((s) => ({
        studentId: s.id,
        name: s.name,
        groupId: s.groupId,
        cardId: s.helpCard!,
      })),
  ];
  return plan.groups.map((group) => {
    const own = students.filter((s) => s.groupId === group.id);
    const hard = group.cards
      .map((card, index) => {
        const states = own.map((s) => s.cards[card.id]).filter(Boolean);
        const attempted = states.filter((s) => s.attempts > 0);
        const wrong = attempted.filter(
          (s) => s.attempts > (s.status === "correct" ? 1 : 0),
        );
        return {
          cardId: card.id,
          number: index + 1,
          prompt: card.prompt,
          attempted: attempted.length,
          wrong: wrong.length,
          rate: attempted.length ? wrong.length / attempted.length : 0,
        };
      })
      .filter((c) => c.wrong > 0)
      .sort(
        (a, b) => b.rate - a.rate || b.wrong - a.wrong || a.number - b.number,
      )
      .slice(0, 3);
    const requests = [
      ...new Map(
        help
          .filter((r) => r.groupId === group.id)
          .map((r) => [`${r.studentId}:${r.cardId}`, r]),
      ).values(),
    ];
    const solved = own.reduce(
      (sum, s) =>
        sum +
        group.cards.filter(
          (c) => s.cards[c.id] && s.cards[c.id].status !== "todo",
        ).length,
      0,
    );
    return {
      groupId: group.id,
      pupils: own.length,
      solved,
      total: own.length * group.cards.length,
      hard,
      requests,
      advice: hard[0] ?? null,
    };
  });
}
/** Spreadsheet formula injection is neutralized before RFC4180 quoting. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function reportCsv(
  plan: LessonPlan,
  students: StudentRow[],
  headers: string[],
): string {
  const rows = students.map((s) => {
    const group = plan.groups.find((g) => g.id === s.groupId);
    const solved =
      group?.cards.filter(
        (c) => s.cards[c.id] && s.cards[c.id].status !== "todo",
      ).length ?? 0;
    return [
      s.name,
      group?.grade ?? "",
      solved,
      s.hintsUsed,
      s.needsHelp ? 1 : 0,
      s.id.startsWith("demo-student-") ? 1 : 0,
    ];
  });
  return (
    "\uFEFF" +
    [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")
  );
}
