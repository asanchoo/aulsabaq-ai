"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "./motion";

/** Число отсчитывается от нуля один раз, когда появляется на экране (1,2 секунды). */
export function CountUp({ value, suffix = "", locale }: { value: number; suffix?: string; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, threshold: 0.5 });
  const reduced = useReducedMotion();
  const [n, setN] = useState(value);

  useEffect(() => {
    if (reduced || !seen) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 1200);
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced, value]);

  return (
    <span ref={ref} className="tabular">
      {n.toLocaleString(locale === "kk" ? "kk-KZ" : "ru-RU")}
      {suffix}
    </span>
  );
}
