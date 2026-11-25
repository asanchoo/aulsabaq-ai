import { expect, it } from "vitest";
import { elapsedMs, parseRun } from "@/lib/run-state";
it("rejects corrupted clock storage", () => {
  for (const raw of [
    "",
    "null",
    "{}",
    '{"startedAt":1}',
    '{"startedAt":-1,"pausedAt":null}',
    '{"startedAt":100,"pausedAt":50}',
    '{"startedAt":1e400,"pausedAt":null}',
  ])
    expect(parseRun(raw)).toBeNull();
});
it("accepts a running and paused clock", () => {
  expect(parseRun('{"startedAt":100,"pausedAt":null}')).toEqual({
    startedAt: 100,
    pausedAt: null,
  });
  expect(parseRun('{"startedAt":100,"pausedAt":500}')).toEqual({
    startedAt: 100,
    pausedAt: 500,
  });
});
it("freezes paused time and clamps backwards clock changes", () => {
  expect(elapsedMs({ startedAt: 100, pausedAt: 500 }, 1000)).toBe(400);
  expect(elapsedMs({ startedAt: 100, pausedAt: null }, 1000)).toBe(900);
  expect(elapsedMs({ startedAt: 100, pausedAt: null }, 0)).toBe(0);
  expect(elapsedMs(null, 1000)).toBe(0);
});
