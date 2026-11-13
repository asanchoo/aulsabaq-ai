"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Dict } from "@/lib/i18n";
import { useInView, useReducedMotion } from "./motion";

/**
 * Живой экран ученика на первом экране.
 * Сценарий по кругу: ученица печатает ответ, берёт подсказку-вопрос, дописывает,
 * нажимает «Проверить», видит «Верно!» и листает к следующей карточке.
 * Карточка учителя слева внизу повторяет то, что учитель видит у себя в это время.
 * Анимация идёт только пока блок на экране; при «уменьшить движение» показываем статичный кадр.
 */

type Press = "hint" | "check" | null;
type Frame = { card: number; typed: string; hint: boolean; press: Press; success: boolean; leaving: boolean };

export function HeroDemo({ dict, className = "" }: { dict: Dict; className?: string }) {
  const p = dict.phone;
  const cards = p.cards;
  const root = useRef<HTMLDivElement>(null);
  const visible = useInView(root, { threshold: 0.3 });
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState<Frame>({ card: 0, typed: cards[0].partial, hint: true, press: null, success: false, leaving: false });
  const [seconds, setSeconds] = useState(12 * 60 + 40);

  // Сценарий: цепочка пауз, которая отменяется, когда блок уходит с экрана.
  useEffect(() => {
    if (reduced || !visible) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    const set = (patch: Partial<Frame>) => !cancelled && setFrame((f) => ({ ...f, ...patch }));

    (async () => {
      for (let i = 0; !cancelled; i = (i + 1) % cards.length) {
        const c = cards[i];
        set({ card: i, typed: "", hint: false, press: null, success: false, leaving: false });
        await sleep(900);
        for (let k = 1; k <= c.partial.length && !cancelled; k++) {
          set({ typed: c.answer.slice(0, k) });
          await sleep(280);
        }
        if (c.hint) {
          await sleep(500);
          set({ press: "hint" });
          await sleep(300);
          set({ press: null, hint: true });
          await sleep(2000);
        }
        for (let k = c.partial.length + 1; k <= c.answer.length && !cancelled; k++) {
          set({ typed: c.answer.slice(0, k) });
          await sleep(280);
        }
        await sleep(600);
        set({ press: "check" });
        await sleep(300);
        set({ press: null, success: true });
        await sleep(1800);
        set({ leaving: true });
        await sleep(450);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced, visible, cards]);

  // Часы урока на карточке учителя
  useEffect(() => {
    if (reduced || !visible) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduced, visible]);

  const c = cards[frame.card];
  const done = frame.success ? c.n : c.n - 1;
  const status = frame.success ? t(p.statusDone, { n: c.n }) : frame.hint && c.hint ? p.statusHint : p.liveText;
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div ref={root} role="img" aria-label={p.label} className={className}>
      {/* Телефон */}
      <div aria-hidden className="aspect-[300/610] w-[240px] rounded-[44px] bg-[#111] p-2.5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)] sm:w-[270px] lg:w-[290px]">
        <div className="relative h-full overflow-hidden rounded-[35px] bg-white text-[#16181a]">
          <div
            key={frame.card}
            className={`flex h-full flex-col gap-2.5 px-4 pt-9 pb-4 sm:gap-3 sm:px-5 sm:pt-11 sm:pb-5 ${frame.leaving ? "phone-leave" : "phone-enter"}`}
          >
            <div className="flex items-center justify-between text-[12.5px] text-muted">
              <span>{p.student}</span>
              <span className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} className={`h-1 w-5 rounded-full transition-colors duration-500 ${n <= done ? "bg-ink" : "bg-line"}`} />
                ))}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted sm:mt-2">{t(p.cardOf, { n: c.n })}</p>
            <p className={`leading-[1.15] font-medium tracking-[-0.02em] ${c.task.length > 30 ? "text-[17px] sm:text-[19px]" : "text-[21px] sm:text-[26px]"}`}>
              {c.task}
            </p>
            <div
              className={`flex h-13 items-center rounded-xl border-[1.5px] px-4 font-mono text-[22px] font-medium transition-colors duration-300 ${
                frame.success ? "border-[#16a34a] bg-mint-soft" : "border-line-strong"
              }`}
            >
              {frame.typed}
              {!frame.success && <i className="caret ml-0.5 h-6 w-0.5 bg-ink" />}
              {frame.success && (
                <svg viewBox="0 0 24 24" className="pop ml-auto size-5 text-[#16a34a]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </div>
            {frame.hint && c.hint && !frame.success && (
              <div className="pop rounded-[14px] bg-mint px-3.5 py-3 text-[14px] leading-snug">
                <small className="mb-0.5 block text-[11.5px] text-[#3f5a4b]">{p.hintLabel}</small>
                {c.hint}
              </div>
            )}
            {frame.success && <div className="pop rounded-[14px] bg-ink px-3.5 py-3 text-[14px] leading-snug text-white">{p.success}</div>}
            <div className="mt-auto grid gap-2">
              <span
                className={`grid h-11.5 place-items-center rounded-xl text-[14px] font-semibold text-white transition-transform duration-150 ${
                  frame.press === "check" ? "scale-95 bg-black" : "bg-ink"
                }`}
              >
                {p.check}
              </span>
              <span
                className={`grid h-11.5 place-items-center rounded-xl text-[14px] font-semibold transition-transform duration-150 ${
                  frame.press === "hint" ? "scale-95 bg-mint" : "bg-surface"
                }`}
              >
                {p.more}
              </span>
            </div>
            <span className="hidden text-center text-[12.5px] text-muted underline underline-offset-[3px] sm:block">{p.help}</span>
          </div>
        </div>
      </div>

      {/* Что в это время видит учитель */}
      <div aria-hidden className="absolute bottom-6 left-6 hidden w-[248px] rounded-card border border-line bg-white p-4 shadow-[0_12px_30px_-18px_rgb(0_0_0/0.25)] xl:block">
        <div className="flex items-center justify-between text-[0.8rem] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="live-dot size-2 rounded-full bg-[#22c55e]" />
            {p.live}
          </span>
          <span className="tabular font-mono">{clock}</span>
        </div>
        <p key={status} className="fade-in mt-2 min-h-[2.6em] text-[0.95rem] leading-snug font-medium">
          {status}
        </p>
      </div>
    </div>
  );
}
