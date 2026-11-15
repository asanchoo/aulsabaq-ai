"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "./motion";

/**
 * Разряды через неразрывный пробел, как принято в русском и казахском: 2 654.
 * Не toLocaleString: на сервере и в браузере разные данные локалей, и для kk-KZ
 * сервер выдавал «2,654», а браузер «2 654», из-за чего React перерисовывал блок.
 */
function formatNumber(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

/** Число отсчитывается от нуля один раз, когда появляется на экране (1,2 секунды). */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string; locale?: string }) {
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
      {formatNumber(n)}
      {suffix}
    </span>
  );
}
