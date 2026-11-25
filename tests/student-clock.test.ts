import { expect, it } from "vitest";
import { demoFor } from "@/lib/demo";
import { studentView } from "@/lib/student-view";
import type { StoredSession } from "@/lib/store";

const plan = demoFor("ru");
const group = plan.groups[1];
const session: StoredSession = {
  lessonId: "lesson",
  plan,
  groupId: group.id,
  name: "T11",
  progress: {},
  currentCard: null,
  needsHelp: false,
  helpCard: null,
};

it("sends a schedule-derived wait with locked main and extra cards, without their answers", () => {
  const view = studentView(
    { ...session, run: { startedAt: Date.now() - 20 * 60000, pausedAt: null } },
    "test",
  )!;
  expect(view.clock?.unlockInMinutes).toBe(5);
  expect(
    view.cards.filter((c) => c.purpose === "practice").every((c) => c.locked),
  ).toBe(true);
  expect(
    view.cards.filter((c) => c.purpose === "review").every((c) => !c.locked),
  ).toBe(true);
  expect(view.extraCards.length).toBeGreaterThan(0);
  expect(view.extraCards.every((c) => c.locked && c.answer === undefined)).toBe(
    true,
  );
});
it("keeps cards locked on pause and removes the time promise", () => {
  const now = Date.now();
  const view = studentView(
    {
      ...session,
      run: { startedAt: now - 30 * 60000, pausedAt: now - 10 * 60000 },
    },
    "test",
  )!;
  expect(view.clock?.unlockInMinutes).toBeNull();
  expect(
    view.cards.filter((c) => c.purpose === "practice").every((c) => c.locked),
  ).toBe(true);
});
it("opens main and extra cards after the explanation", () => {
  const view = studentView(
    { ...session, run: { startedAt: Date.now() - 26 * 60000, pausedAt: null } },
    "test",
  )!;
  expect(view.clock?.unlockInMinutes).toBe(0);
  expect([...view.cards, ...view.extraCards].every((c) => !c.locked)).toBe(
    true,
  );
});
