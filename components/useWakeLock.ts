"use client";
import { useEffect } from "react";

/** Release on pause/unmount; reacquire when the visible lesson tab returns. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let stopped = false;
    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    const acquire = async () => {
      if (
        stopped ||
        requesting ||
        document.visibilityState !== "visible" ||
        (lock && !lock.released)
      )
        return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) await next.release();
        else lock = next;
      } catch {
        /* unavailable or denied: timer remains usable */
      } finally {
        requesting = false;
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
