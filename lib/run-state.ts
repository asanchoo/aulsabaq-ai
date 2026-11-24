export type RunState = { startedAt: number; pausedAt: number | null };
export const runKey = (id: string) => `aulsabaq-run-${id}`;
export function parseRun(raw: string): RunState | null {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.startedAt !== "number" || !Number.isFinite(v.startedAt) || v.startedAt < 0) return null;
    if (v.pausedAt !== null && (typeof v.pausedAt !== "number" || !Number.isFinite(v.pausedAt) || v.pausedAt < v.startedAt)) return null;
    return { startedAt: v.startedAt, pausedAt: v.pausedAt };
  } catch { return null; }
}
export function elapsedMs(state: RunState | null, now: number): number {
  return state ? Math.max(0, (state.pausedAt ?? now) - state.startedAt) : 0;
}
