"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Dict } from "@/lib/i18n";
import { useInView, useReducedMotion } from "./motion";

/**
 * Переписка ученика с помощником: сообщения появляются по одному, как в чате,
 * когда блок впервые оказался на экране. В конце учитель получает сигнал «нужна помощь».
 */
export function HintChat({ dict }: { dict: Dict }) {
  const s = dict.students;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, threshold: 0.35 });
  const reduced = useReducedMotion();
  const total = s.hints.length + 2; // вопрос ученика, подсказки, сигнал учителю
  const [step, setStep] = useState(0);

  // Шаг растёт только в колбэке таймера; при «уменьшить движение» сразу показываем всю переписку.
  useEffect(() => {
    if (reduced || !seen) return;
    const id = setInterval(() => setStep((n) => (n >= total ? n : n + 1)), 900);
    return () => clearInterval(id);
  }, [seen, reduced, total]);
  const shown = reduced ? total : step;

  const typing = shown > 0 && shown < total - 1;

  return (
    <div ref={ref} aria-hidden className="grid min-h-[30rem] content-start gap-3 rounded-frame bg-white/[0.06] p-5 sm:p-8">
      <div className="rounded-card bg-white p-5 text-ink">
        <p className="text-[0.8rem] text-muted">
          {t(dict.common.card, { n: 2 })} · {t(dict.common.grade, { n: 2 })}
        </p>
        <p className="mt-1.5 text-[1.6rem] font-medium tracking-[-0.02em]">{s.task}</p>
      </div>

      {shown >= 1 && <p className="pop ml-auto max-w-[75%] rounded-card rounded-br-md bg-white/12 px-4 py-2.5 text-[0.95rem]">{s.ask}</p>}

      {s.hints.map((hint, i) =>
        shown >= i + 2 ? (
          <div key={hint} className="pop max-w-[88%] rounded-card rounded-bl-md bg-mint px-4 py-3 text-ink">
            <small className="block text-[0.75rem] font-semibold text-[#3f5a4b]">{t(s.hintLabel, { n: i + 1 })}</small>
            <p className="mt-0.5 text-[0.95rem] leading-snug">{hint}</p>
          </div>
        ) : null,
      )}

      {typing && (
        <span className="flex w-16 gap-1 rounded-card rounded-bl-md bg-mint/90 px-4 py-3.5">
          {[0, 1, 2].map((d) => (
            <i key={d} className="caret size-1.5 rounded-full bg-ink/60" style={{ animationDelay: `${d * 0.2}s` }} />
          ))}
        </span>
      )}

      {shown >= total && (
        <div className="pop mt-3 flex items-center gap-3 rounded-card bg-white p-4 text-ink">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-help-soft text-help">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{s.alertTitle}</p>
            <p className="text-[0.88rem] text-muted">{s.alertText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
