import { expect, it } from "vitest";
import { nextLessonDraft } from "@/lib/next-lesson";
import { demoFor } from "@/lib/demo";
import { demoClass } from "@/lib/demo-class";

it("preserves subject, groups, topics and per-group teaching languages", () => {
  const plan = demoFor("ru");
  plan.groups[1].language = "kk";
  const draft = nextLessonDraft(plan, []);
  expect(draft.subject).toBe(plan.subject);
  expect(draft.groups.map((g) => [g.grade, g.language, g.topic])).toEqual(
    plan.groups.map((g) => [g.grade, g.language ?? plan.language, g.topic]),
  );
  expect(draft.groups.every((g) => g.notes === "")).toBe(true);
});
it("uses task text for difficulties and advice, caps notes and excludes pupil data", () => {
  const plan = demoFor("ru");
  const students = demoClass(plan, 42, 1000, 30);
  students[0].name = "private-name";
  const draft = nextLessonDraft(plan, students);
  expect(draft.groups[0].notes).toContain(plan.groups[0].cards[1].prompt);
  expect(draft.groups[0].notes).toContain("На следующем уроке разберите");
  expect(draft.groups.every((g) => (g.notes?.length ?? 0) <= 300)).toBe(true);
  expect(JSON.stringify(draft)).not.toContain("private-name");
  expect(JSON.stringify(draft)).not.toContain("studentId");
});
