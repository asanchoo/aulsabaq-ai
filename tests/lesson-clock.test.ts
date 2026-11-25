import { expect, it } from "vitest";
import {
  cardUnlocked,
  practiceUnlocked,
  practiceUnlockInMinutes,
} from "@/lib/lesson-clock";
import { demoFor } from "@/lib/demo";
const plan = demoFor("ru"),
  group = plan.groups[1],
  start = 100000;
it("keeps the existing workflow when clock is absent", () =>
  expect(practiceUnlocked(plan, group.id, null, start)).toBe(true));
it("opens practice only after that group's explanation", () => {
  const run = { startedAt: start, pausedAt: null };
  expect(practiceUnlocked(plan, group.id, run, start + 24 * 60000)).toBe(false);
  expect(practiceUnlocked(plan, group.id, run, start + 25 * 60000)).toBe(true);
  expect(cardUnlocked(plan, group.id, group.cards[0], run, start)).toBe(true);
  expect(cardUnlocked(plan, group.id, group.cards[6], run, start)).toBe(false);
});
it("freezes access on pause regardless of later wall time", () =>
  expect(
    practiceUnlocked(
      plan,
      group.id,
      { startedAt: start, pausedAt: start + 20 * 60000 },
      start + 100 * 60000,
    ),
  ).toBe(false));

it("rounds the wait up until the exact explanation boundary", () => {
  const run = { startedAt: start, pausedAt: null };
  expect(practiceUnlockInMinutes(plan, group.id, run, start)).toBe(25);
  expect(
    practiceUnlockInMinutes(plan, group.id, run, start + 24 * 60000 + 59000),
  ).toBe(1);
  expect(practiceUnlockInMinutes(plan, group.id, run, start + 25 * 60000)).toBe(
    0,
  );
  expect(practiceUnlockInMinutes(plan, group.id, run, start + 50 * 60000)).toBe(
    0,
  );
});
it("does not promise a wait while paused, stopped or without an explanation", () => {
  expect(practiceUnlockInMinutes(plan, group.id, null, start)).toBeNull();
  expect(
    practiceUnlockInMinutes(
      plan,
      group.id,
      { startedAt: start, pausedAt: start + 60000 },
      start + 50 * 60000,
    ),
  ).toBeNull();
  expect(
    practiceUnlockInMinutes(
      plan,
      "missing",
      { startedAt: start, pausedAt: null },
      start,
    ),
  ).toBeNull();
});
it("uses the group's first explanation, independent of timeline order or later checks", () => {
  const reordered = { ...plan, timeline: [...plan.timeline].reverse() };
  const run = { startedAt: start, pausedAt: null };
  const end = plan.timeline.filter(
    (s) => s.groupId === plan.groups[0].id && s.mode === "with_teacher",
  )[0].endMin;
  expect(
    practiceUnlockInMinutes(reordered, plan.groups[0].id, run, start + 1000),
  ).toBe(end);
});
