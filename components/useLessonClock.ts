"use client";
import { useEffect, useRef, useState } from "react";
import { useLocal } from "@/lib/local";
import { elapsedMs, parseRun, runKey } from "@/lib/run-state";
import { timeSlots } from "@/lib/lesson";
import { lessonSignal, SOUND_KEY } from "@/lib/lesson-signal";
import type { LessonPlan } from "@/lib/schema";
import { useWakeLock } from "./useWakeLock";

/** A single clock primitive keeps the full lesson page and phone controls on identical timing rules. */
function useClockState(lessonId: string, duration = Infinity) {
  const state = parseRun(useLocal(runKey(lessonId)));
  const [now, setNow] = useState(() => Date.now());
  const elapsed = elapsedMs(state, now);
  const minute = Math.floor(elapsed / 60000);
  const ended = minute >= duration;
  const ticking = !!state && state.pausedAt === null && !ended;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return { state, now, elapsed, minute, ended, ticking };
}
export const useRunning = (lessonId: string) =>
  parseRun(useLocal(runKey(lessonId))) !== null;
export function useRunMinute(lessonId: string): number | undefined {
  const clock = useClockState(lessonId);
  return clock.state ? clock.minute : undefined;
}
export function useLessonClock(lessonId: string, plan: LessonPlan) {
  const clock = useClockState(lessonId, plan.durationMin);
  const sound = useLocal(SOUND_KEY) === "on";
  const slots = timeSlots(plan);
  const slot = slots.find(
    (s) => s.startMin <= clock.minute && clock.minute < s.endMin,
  );
  const next = slot ? slots[slots.indexOf(slot) + 1] : undefined;
  const boundary = slot?.startMin ?? (clock.ended ? plan.durationMin : -1);
  const previous = useRef<number | null>(null);
  useWakeLock(clock.ticking);
  useEffect(() => {
    if (
      previous.current !== null &&
      previous.current !== boundary &&
      clock.ticking
    )
      lessonSignal();
    previous.current = clock.state ? boundary : null;
  }, [boundary, clock.state, clock.ticking]);
  return {
    ...clock,
    sound,
    slots,
    slot,
    next,
    fresh:
      !!slot &&
      !clock.state?.pausedAt &&
      clock.elapsed - slot.startMin * 60000 < 10000 &&
      slot.startMin > 0,
  };
}
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
