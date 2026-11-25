import { parseRun, runKey, type RunState } from "./run-state";
import { enableSound, soundEnabled } from "./lesson-signal";

/** Both teacher screens write the same local state; RunSync serializes it to the server. */
export function saveRun(lessonId: string, state: RunState | null) {
  try {
    if (state) localStorage.setItem(runKey(lessonId), JSON.stringify(state));
    else localStorage.removeItem(runKey(lessonId));
    window.dispatchEvent(new Event("aulsabaq-local-change"));
  } catch {
    /* The current page remains usable when browser persistence is blocked. */
  }
}
export function changeRun(
  lessonId: string,
  fn: (state: RunState, now: number) => RunState | null,
) {
  let state: RunState | null = null;
  try {
    state = parseRun(localStorage.getItem(runKey(lessonId)) ?? "");
  } catch {
    /* no stored clock */
  }
  if (state) saveRun(lessonId, fn(state, Date.now()));
}
export function startRun(lessonId: string) {
  if (soundEnabled()) enableSound(true);
  saveRun(lessonId, { startedAt: Date.now(), pausedAt: null });
}
export function pauseRun(lessonId: string) {
  changeRun(lessonId, (state, now) =>
    state.pausedAt
      ? { startedAt: state.startedAt + now - state.pausedAt, pausedAt: null }
      : { ...state, pausedAt: now },
  );
}
export function shiftRun(lessonId: string, ms: number) {
  changeRun(lessonId, (state, now) => ({
    ...state,
    startedAt: Math.min(state.startedAt + ms, state.pausedAt ?? now),
  }));
}
export function finishRun(lessonId: string) {
  window.dispatchEvent(
    new CustomEvent("aulsabaq-show-report", { detail: { lessonId } }),
  );
  saveRun(lessonId, null);
}
