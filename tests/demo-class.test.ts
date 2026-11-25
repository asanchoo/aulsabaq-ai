import { expect, it } from "vitest";
import { demoClass } from "@/lib/demo-class";
import { demoFor } from "@/lib/demo";
const plan = demoFor("ru");
it("is repeatable, uses plan groups and synthetic ids", () => {
  const rows = demoClass(plan, 42, 100000, 70);
  expect(rows).toEqual(demoClass(plan, 42, 100000, 70));
  expect(rows.length).toBeGreaterThanOrEqual(6);
  expect(rows.length).toBeLessThanOrEqual(9);
  expect(
    rows.every(
      (s) =>
        s.id.startsWith("demo-student-") &&
        plan.groups.some((g) => g.id === s.groupId),
    ),
  ).toBe(true);
});
it("evolves from empty progress to errors, hints and help then progress", () => {
  expect(
    demoClass(plan, 42, 100000, 0).every((s) => !Object.keys(s.cards).length),
  ).toBe(true);
  const middle = demoClass(plan, 42, 100000, 70);
  expect(middle.some((s) => s.needsHelp && s.hintsUsed > 0)).toBe(true);
  expect(
    middle.some((s) => Object.values(s.cards).some((c) => c.attempts >= 3)),
  ).toBe(true);
  expect(demoClass(plan, 42, 100000, 180).every((s) => !s.needsHelp)).toBe(
    true,
  );
});
it("works with four groups and either demo language", () => {
  const kk = demoFor("kk");
  expect(
    demoClass(
      {
        ...kk,
        groups: [
          ...kk.groups,
          ...kk.groups.map((g, i) => ({ ...g, id: "extra-" + i })),
        ],
      },
      1,
      10000,
      80,
    ),
  ).toHaveLength(9);
});
it("shows errors, hints and help within the reviewer's first 30 seconds", () => {
  expect(demoClass(plan, 42, 100000, 20).some((s) => s.needsHelp)).toBe(false);
  const rows = demoClass(plan, 42, 100000, 30);
  const helped = rows.find((s) => s.needsHelp)!;
  expect(helped.hintsUsed).toBeGreaterThan(0);
  expect(helped.helpRequestedAt).toBe(new Date(125000).toISOString());
  expect(Object.values(helped.cards).some((c) => c.attempts >= 3)).toBe(true);
});
