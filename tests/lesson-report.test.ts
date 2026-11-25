import { expect, it } from "vitest";
import { lessonReport, csvCell, reportCsv } from "@/lib/lesson-report";
import { demoFor } from "@/lib/demo";
import { demoClass } from "@/lib/demo-class";
const plan = demoFor("ru");
it("empty classes do not invent successes or advice", () => {
  expect(
    lessonReport(plan, []).every(
      (g) => g.pupils === 0 && g.solved === 0 && g.advice === null,
    ),
  ).toBe(true);
});
it("counts failed attempts even after an eventual correct answer", () => {
  const students = demoClass(plan, 42, 10000, 0);
  const s = students[0];
  const c = plan.groups[0].cards[0];
  s.cards[c.id] = {
    status: "correct",
    attempts: 4,
    hints: 1,
    lastAnswer: "answer",
  };
  const report = lessonReport(plan, students)[0];
  expect(report.solved).toBe(1);
  expect(report.hard).toEqual([]);
  expect(report.advice).toBeNull();
  expect(report.enoughAnswers).toBe(false);
  const other = students.find(
    (row) => row.groupId === s.groupId && row.id !== s.id,
  )!;
  other.cards[c.id] = {
    status: "correct",
    attempts: 1,
    hints: 0,
    lastAnswer: "answer",
  };
  expect(lessonReport(plan, students)[0].advice).toMatchObject({
    number: 1,
    wrong: 1,
    attempted: 2,
    rate: 0.5,
  });
});
it("ignores 1/1 and ranks 2/3 before 1/2, breaking ties by fraction", () => {
  const students = demoClass(plan, 42, 10000, 0).filter(
    (s) => s.groupId === plan.groups[0].id,
  );
  const answer = (card: number, wrong: number, total: number) => {
    for (let i = 0; i < total; i++)
      students[i].cards[plan.groups[0].cards[card].id] = {
        status: i < wrong ? "todo" : "correct",
        attempts: 1,
        hints: 0,
        lastAnswer: "answer",
      };
  };
  answer(0, 1, 1);
  answer(1, 1, 2);
  answer(2, 2, 3);
  answer(3, 2, 2);
  const report = lessonReport(plan, students)[0];
  expect(report.hard.map((c) => c.number)).toEqual([4, 3, 2]);
  expect(report.advice?.number).toBe(4);
});
it("shortens the advice task to 80 characters without breaking Unicode", () => {
  const copy = structuredClone(plan);
  copy.groups[0].cards[0].prompt = "  Ұзын\n" + "сұрақ ".repeat(30);
  const students = demoClass(copy, 42, 10000, 0).filter(
    (s) => s.groupId === copy.groups[0].id,
  );
  for (const s of students.slice(0, 2))
    s.cards[copy.groups[0].cards[0].id] = {
      status: "todo",
      attempts: 1,
      hints: 0,
      lastAnswer: "0",
    };
  const report = lessonReport(copy, students)[0];
  expect(Array.from(report.advice!.prompt)).toHaveLength(80);
  expect(report.advice!.prompt).toMatch(/^Ұзын сұрақ /);
  expect(report.advice!.prompt.endsWith("…")).toBe(true);
  expect(report.hard[0].prompt).toBe(copy.groups[0].cards[0].prompt);
});
it("distinguishes too few answers from a class with no mistakes", () => {
  const students = demoClass(plan, 42, 10000, 0).filter(
    (s) => s.groupId === plan.groups[0].id,
  );
  for (const s of students.slice(0, 2))
    s.cards[plan.groups[0].cards[0].id] = {
      status: "correct",
      attempts: 1,
      hints: 0,
      lastAnswer: "answer",
    };
  const report = lessonReport(plan, students)[0];
  expect(report.advice).toBeNull();
  expect(report.enoughAnswers).toBe(true);
});
it("deduplicates observed and current help requests", () => {
  const students = demoClass(plan, 42, 10000, 70);
  const s = students.find((s) => s.needsHelp)!;
  const row = {
    studentId: s.id,
    name: s.name,
    groupId: s.groupId,
    cardId: s.helpCard!,
  };
  expect(
    lessonReport(plan, students, [row, row]).find(
      (g) => g.groupId === s.groupId,
    )?.requests,
  ).toHaveLength(1);
});
it("quotes CSV and neutralizes spreadsheet formulas", () => {
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
  for (const s of ['=HYPERLINK("bad")', " +1", "\t@SUM(A1)", "-1"])
    expect(csvCell(s).startsWith("\"'")).toBe(true);
  const rows = demoClass(plan, 42, 10000, 70);
  rows[0].name = "=1+1";
  const csv = reportCsv(plan, rows, [
    "name",
    "grade",
    "solved",
    "hints",
    "help",
    "demo",
  ]);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"\'=1+1"');
});
