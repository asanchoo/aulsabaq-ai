"use client";

import Link from "next/link";
import { Fragment } from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { getVariantsDict, getClockDict, getDict, t, type Locale } from "@/lib/i18n";
import {
  isFinished,
  MAX_HINTS,
  REVEAL_AFTER,
  type StudentCard,
} from "@/lib/student";
import type { StudentView } from "@/lib/student-view";
import { ReadAloud } from "./ReadAloud";
import { AutoTextarea } from "./AutoTextarea";
import { RuleCard, similarExample, WorkedExample } from "./StudentGuide";
import { TrainerScreen, type TrainerResult } from "./TrainerScreen";

const REFRESH_MS = 10_000;
/** Экран «Памятка» в маршруте ученика: перед первым заданием по новой теме. */
const GUIDE = "guide";
/** Экран тренажёра: после основных карточек и запаса. */
const TRAINER = "trainer";

/** Lucide Lock, inline to avoid importing an icon bundle. */
function CardLock() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Видел ли ученик памятку: помним в браузере, чтобы не показывать её снова после каждого обновления. */
function guideSeen(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`aulsabaq-guide:${sessionId}`) === "1";
  } catch {
    return false;
  }
}

/** Окно поверх карточки: правило или похожий пример, карточка и ответ при этом не теряются. */
function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      className="m-auto max-h-[88dvh] w-[min(calc(100%-2rem),34rem)] max-w-none overflow-y-auto rounded-frame bg-bg p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-bg px-5 py-3">
        <p className="font-semibold">{title}</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  );
}

/**
 * Экран ученика на телефоне. Ответ проверяет сервер (эталон в браузер не приходит),
 * подсказки выдаются по одной, флаг «нужна помощь» сразу виден в панели учителя.
 * Раз в 10 секунд экран обновляется: учитель мог снять флаг помощи или исправить карточку.
 */
export function StudentApp({
  lang,
  sessionId,
}: {
  lang: Locale;
  sessionId: string;
}) {
  const dict = getDict(lang);
  const d = dict.student;
  const clockLabels = getClockDict(lang);
  const [view, setView] = useState<StudentView | null>(null);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    cardId: string;
    correct: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<
    "answer" | "hint" | "help" | "action" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [seenGuide, setSeenGuide] = useState(() => guideSeen(sessionId));
  const [sheet, setSheet] = useState<"rule" | "similar" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/student/${sessionId}`, {
        cache: "no-store",
      });
      if (response.status === 404) return setMissing(true);
      if (!response.ok) return;
      setView(await response.json());
    } catch {
      // нет сети: покажем старые данные, следующая попытка через 10 секунд
    }
  }, [sessionId]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  async function send(
    body: Record<string, unknown>,
    kind: NonNullable<typeof busy> = "action",
  ) {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(`/api/student/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          d.errors[data.error as keyof typeof d.errors] ?? d.errors.network,
        );
        return null;
      }
      setView(data);
      return data as StudentView & {
        correct?: boolean;
        trainerResult?: TrainerResult;
      };
    } catch {
      setError(d.errors.network);
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (missing) {
    return (
      <div className="mx-auto grid max-w-[30rem] gap-6 py-10">
        <p className="text-[1.2rem] font-semibold">{d.notFound}</p>
        <Link href={`/${lang}/join`} className="btn btn-primary">
          {d.rejoin}
        </Link>
      </div>
    );
  }
  if (!view) {
    return (
      <p role="status" className="mx-auto max-w-[30rem] py-10 text-muted">
        {d.loading}
      </p>
    );
  }

  // Маршрут ученика: основные карточки (с памяткой перед новой темой) → запас → тренажёр.
  // Запас открывается, когда основные решены: сначала главное, потом дополнительное.
  const cards = view.cards;
  // ?? []: во время выкладки новая страница может получить ответ старого сервера без этих полей.
  const extras = view.extraCards ?? [];
  const guide = view.guide ?? null;
  const trainer = view.trainer ?? null;
  const finishedCount = cards.filter((c) => isFinished(c.state)).length;
  const mainDone = finishedCount === cards.length;
  const extraOpen = extras.find((c) => !isFinished(c.state));
  const allDone = mainDone && !extraOpen;
  const pool = mainDone ? [...cards, ...extras] : cards;
  const firstOpen =
    cards.find((c) => !isFinished(c.state)) ??
    (mainDone ? extraOpen : undefined);
  const card =
    pool.find((c) => c.id === selected) ?? firstOpen ?? cards[cards.length - 1];
  const at = pool.findIndex((c) => c.id === card.id);
  const nextOpen =
    pool.find((c, i) => i > at && !isFinished(c.state)) ??
    pool.find((c) => !isFinished(c.state) && c.id !== card.id);
  const isExtra = extras.some((c) => c.id === card.id);
  const showTrainer =
    !!trainer && (selected === TRAINER || (selected === null && allDone));
  // Маршрут: повторение → памятка → задания по новой теме. Памятку показываем сами один раз,
  // когда ученик дошёл до первого задания по новой теме; дальше она по кнопке «Правило».
  // Памятки нет (ответ старого сервера): шаг «Памятка» не показываем.
  const firstPractice = guide
    ? cards.find((c) => c.purpose === "practice")
    : undefined;
  const showGuide =
    !!guide &&
    (selected === GUIDE ||
      (selected === null && !seenGuide && firstOpen?.purpose === "practice"));
  const g = d.guide;
  const x = d.extra;
  const wait = view.clock?.unlockInMinutes;
  const lockMessage =
    clockLabels.locked +
    (wait != null && wait > 0
      ? `. ${t(clockLabels.unlockWait, { n: wait })}`
      : "");
  const showLockNotice = [...cards, ...extras].some(
    (c) => c.id === lockedNotice && c.locked,
  );

  function openGuide() {
    setLockedNotice(null);
    setSelected(GUIDE);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function openTrainer() {
    setLockedNotice(null);
    setSelected(TRAINER);
    setError(null);
  }

  async function trainerAction(
    body: Record<string, unknown>,
  ): Promise<TrainerResult | null> {
    const data = await send(body, "answer");
    return data?.trainerResult ?? null;
  }

  function finishGuide() {
    try {
      localStorage.setItem(`aulsabaq-guide:${sessionId}`, "1");
    } catch {
      // без хранилища памятка просто покажется ещё раз
    }
    setSeenGuide(true);
    const target = firstOpen ?? firstPractice;
    if (target) open(target);
    else setSelected(null);
  }

  function open(target: StudentCard) {
    if (target.locked) {
      setLockedNotice(target.id);
      return;
    }
    setLockedNotice(null);
    setSelected(target.id);
    setAnswer("");
    setFeedback(null);
    setError(null);
    void fetch(`/api/student/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", cardId: target.id }),
    }).catch(() => undefined);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || busy) return;
    const result = await send(
      { action: "answer", cardId: card.id, answer },
      "answer",
    );
    if (result && typeof result.correct === "boolean") {
      setFeedback({ cardId: card.id, correct: result.correct });
      // Верный ответ: карточка остаётся на экране с «Верно!» и кнопкой «Дальше», а не перескакивает сразу.
      if (result.correct) {
        setSelected(card.id);
        setAnswer("");
      }
    }
  }

  async function hint() {
    setBusy("hint");
    setError(null);
    try {
      const response = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cardId: card.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        setError(
          d.errors[data.error as keyof typeof d.errors] ?? d.errors.network,
        );
      await load();
    } catch {
      setError(d.errors.network);
    } finally {
      setBusy(null);
    }
  }

  const state = card.state;
  const todo = state.status === "todo";
  const hintsLeft = MAX_HINTS - state.hints;
  const showFeedback = feedback?.cardId === card.id;
  const similar = guide ? similarExample(guide, card.difficulty) : null;

  return (
    <div className="mx-auto grid w-full max-w-[34rem] grid-cols-[minmax(0,1fr)] gap-5">
      {view.clock && (
        <p role="status" className="mb-4 rounded-card bg-stage p-4 text-sm">
          {view.clock.mode === "independent"
            ? t(clockLabels.independent, { cards: view.clock.cards.join(", ") })
            : clockLabels[view.clock.mode]}
        </p>
      )}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {view.name} · {t(dict.common.grade, { n: view.grade })}
          </p>
          <p className="truncate text-[0.88rem] text-muted">
            {view.subject}: {view.topic}
          </p>
          {view.ownNumbers && <p className="mt-1 text-sm text-muted">{getVariantsDict(lang).own}</p>}
        </div>
      </header>

      <nav aria-label={d.cardsNav}>
        <p className="tabular mb-2 text-[0.88rem] font-semibold">
          {t(d.progress, { a: finishedCount, b: cards.length })}
        </p>
        <ol className="flex flex-wrap gap-2">
          {cards.map((c) => {
            const done = isFinished(c.state);
            const current = !showGuide && c.id === card.id;
            return (
              <Fragment key={c.id}>
                {c.id === firstPractice?.id && (
                  <li>
                    <button
                      type="button"
                      onClick={openGuide}
                      aria-current={showGuide ? "step" : undefined}
                      className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-[0.9rem] font-semibold transition-colors ${
                        seenGuide
                          ? "bg-mint-soft text-ink"
                          : "border border-ink bg-white text-ink"
                      } ${showGuide ? "ring-2 ring-ink ring-offset-2" : ""}`}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
                      </svg>
                      {g.nav}
                    </button>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    aria-disabled={c.locked || undefined}
                    aria-describedby={c.locked ? "card-lock-notice" : undefined}
                    onClick={() => open(c)}
                    aria-current={current ? "step" : undefined}
                    aria-label={`${t(dict.common.card, { n: c.number })}: ${c.locked ? clockLabels.lockedCard : d.status[c.state.status]}`}
                    className={`btn btn-secondary tabular min-h-11 size-11 gap-1 p-0 text-[0.95rem] font-semibold ${
                      c.locked
                        ? "border-dashed bg-surface text-muted"
                        : done
                          ? c.state.status === "self_wrong"
                            ? "bg-help-soft text-help"
                            : "bg-mint text-ink"
                          : "border border-line-strong bg-white text-ink"
                    } ${current ? "ring-2 ring-ink ring-offset-2" : ""}`}
                  >
                    {c.locked ? (
                      <>
                        <CardLock />
                        <span>{c.number}</span>
                      </>
                    ) : done && c.state.status !== "self_wrong" ? (
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      c.number
                    )}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
        {(extras.length > 0 || trainer) && (
          <div className="mt-4">
            <p className="tabular mb-2 text-[0.88rem] font-semibold">
              {x.title}
              {extras.length > 0 && (
                <span className="font-normal text-muted">
                  {" "}
                  · {extras.filter((c) => isFinished(c.state)).length} /{" "}
                  {extras.length}
                </span>
              )}
            </p>
            {!mainDone ? (
              <p className="text-[0.85rem] text-muted">{x.locked}</p>
            ) : (
              <ol className="flex flex-wrap gap-2">
                {extras.map((c) => {
                  const done = isFinished(c.state);
                  const current =
                    !showGuide && !showTrainer && c.id === card.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-disabled={c.locked || undefined}
                        aria-describedby={
                          c.locked ? "card-lock-notice" : undefined
                        }
                        onClick={() => open(c)}
                        aria-current={current ? "step" : undefined}
                        aria-label={`${t(x.of, { n: c.number, m: extras.length })}: ${c.locked ? clockLabels.lockedCard : d.status[c.state.status]}`}
                        className={`btn btn-secondary tabular min-h-11 size-11 gap-1 p-0 text-[0.95rem] font-semibold ${
                          c.locked
                            ? "border-dashed bg-surface text-muted"
                            : done
                              ? "bg-mint-soft text-ink"
                              : "border border-dashed border-line-strong bg-white text-ink"
                        } ${current ? "ring-2 ring-ink ring-offset-2" : ""}`}
                      >
                        {c.locked && <CardLock />}
                        {c.number}
                      </button>
                    </li>
                  );
                })}
                {trainer && (
                  <li>
                    <button
                      type="button"
                      onClick={openTrainer}
                      aria-current={showTrainer ? "step" : undefined}
                      className={`tabular inline-flex h-11 items-center gap-2 rounded-full border border-ink bg-white px-4 text-[0.9rem] font-semibold ${showTrainer ? "ring-2 ring-ink ring-offset-2" : ""}`}
                    >
                      {d.trainer.nav} · {trainer.solved}
                    </button>
                  </li>
                )}
              </ol>
            )}
          </div>
        )}
      </nav>
      <p
        id="card-lock-notice"
        role="status"
        className={
          showLockNotice ? "rounded-card bg-surface p-4 text-ink" : "sr-only"
        }
      >
        {showLockNotice ? lockMessage : ""}
      </p>

      {showGuide && (
        <article
          aria-labelledby="guide-title"
          className="grid gap-5 rounded-frame border border-line bg-white p-5 sm:p-6"
        >
          <div>
            <h1
              id="guide-title"
              ref={heading}
              tabIndex={-1}
              className="text-[1.35rem] font-semibold tracking-[-0.01em] outline-none"
            >
              {g.title}
            </h1>
            <p className="mt-1 text-[0.92rem] leading-snug text-muted">
              {g.lead}
            </p>
          </div>
          {guide && <RuleCard guide={guide} dict={dict} />}
          {guide?.examples[0] && (
            <section
              aria-labelledby="solve-title"
              className="grid gap-3 border-t border-line pt-5"
            >
              <div>
                <h2 id="solve-title" className="text-[1.1rem] font-semibold">
                  {g.solveTitle}
                </h2>
                <p className="mt-1 text-[0.9rem] text-muted">{g.solveLead}</p>
              </div>
              <WorkedExample
                key={guide.examples[0].problem}
                example={guide.examples[0]}
                dict={dict}
              />
            </section>
          )}
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={finishGuide}
          >
            {g.toCards}
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="arrow size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 8h10M8.5 4l4 4-4 4" />
            </svg>
          </button>
        </article>
      )}

      {!showGuide && mainDone && !selected && (
        <div role="status" className="rounded-frame bg-mint p-6">
          <p className="text-[1.5rem] font-semibold tracking-[-0.02em]">
            {extras.length || trainer ? x.mainDone : d.allDone}
          </p>
          <p className="mt-2 leading-relaxed">
            {extras.length || trainer ? x.mainDoneText : d.allDoneText}
          </p>
        </div>
      )}

      {showTrainer && trainer && !showGuide && (
        <TrainerScreen
          trainer={trainer}
          dict={dict}
          busy={busy !== null}
          onAnswer={(answer) => trainerAction({ action: "trainer", answer })}
          onSkip={() => trainerAction({ action: "trainer_skip" })}
        />
      )}

      {!showGuide && !showTrainer && card.locked && (
        <p role="status" className="rounded-card bg-stage p-5">
          {lockMessage}
        </p>
      )}
      {!showGuide && !showTrainer && !card.locked && (
        <article
          aria-labelledby="card-title"
          className="rounded-frame border border-line bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1
              id="card-title"
              ref={heading}
              tabIndex={-1}
              className="text-[0.92rem] font-semibold text-muted outline-none"
            >
              {isExtra
                ? t(x.of, { n: card.number, m: extras.length })
                : t(d.cardOf, { n: card.number, m: cards.length })}
            </h1>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface px-3 py-1 text-[0.8rem] font-semibold">
                {dict.lesson.purpose[card.purpose]}
              </span>
              {guide && card.purpose === "practice" && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSheet("rule")}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
                  </svg>
                  {g.ruleButton}
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 text-[1.35rem] leading-snug font-medium tracking-[-0.01em] whitespace-pre-line">
            {card.prompt}
          </p>

          <ReadAloud key={`${card.id}:${card.prompt}`} text={card.prompt} grade={view.grade} language={view.language} lang={lang} />

          {/* Закрытое задание: ответ и проверка */}
          {card.type === "closed" && todo && !state.revealed && (
            <form onSubmit={check} className="mt-5 grid gap-3" noValidate>
              <div>
                <label htmlFor="answer" className="field-label">
                  {d.answer}
                </label>
                {card.inputHint && (
                  <p
                    id="input-hint"
                    className="mb-2 text-[0.92rem] leading-snug text-muted"
                  >
                    {card.inputHint}
                  </p>
                )}
                <AutoTextarea
                  id="answer"
                  singleLine
                  className="field text-[1.1rem] leading-snug"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  inputMode={card.numeric ? "decimal" : "text"}
                  maxLength={200}
                  placeholder={d.answerPlaceholder}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  aria-describedby={
                    [
                      card.inputHint ? "input-hint" : "",
                      showFeedback ? "feedback" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={!answer.trim() || busy !== null}
                aria-busy={busy === "answer"}
              >
                {busy === "answer" ? d.checking : d.check}
              </button>
              {showFeedback && !feedback.correct && (
                <p
                  id="feedback"
                  role="status"
                  className="rounded-card bg-help-soft p-3 leading-snug"
                >
                  {d.wrong}{" "}
                  <span className="tabular text-muted">
                    {t(d.attempts, { n: state.attempts })}
                  </span>
                </p>
              )}
              {state.attempts >= REVEAL_AFTER && (
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {card.purpose === "practice" && similar && (
                    <button
                      type="button"
                      className="link min-h-10 text-[0.92rem] font-semibold"
                      onClick={() => setSheet("similar")}
                    >
                      {g.similar}
                    </button>
                  )}
                  <button
                    type="button"
                    className="link min-h-10 text-[0.92rem] font-semibold"
                    disabled={busy !== null}
                    onClick={() => send({ action: "reveal", cardId: card.id })}
                  >
                    {d.reveal}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Сверка с эталоном после двух попыток */}
          {card.type === "closed" && todo && state.revealed && (
            <div className="mt-5 grid gap-3">
              <div className="rounded-card bg-surface p-4">
                <p className="text-[0.85rem] font-semibold text-muted">
                  {d.reference}
                </p>
                <p className="mt-1 text-[1.2rem] font-semibold">
                  {card.answer}
                </p>
                {state.lastAnswer && (
                  <p className="mt-2 text-[0.9rem] text-muted">
                    {t(d.yourAnswer, { a: state.lastAnswer })}
                  </p>
                )}
              </div>
              <p className="text-[0.9rem] text-muted">{d.revealHint}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={() =>
                    send({ action: "self", cardId: card.id, correct: true })
                  }
                >
                  {d.same}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    send({ action: "self", cardId: card.id, correct: false })
                  }
                >
                  {d.different}
                </button>
              </div>
            </div>
          )}

          {/* Открытое задание: критерии и «Готово» */}
          {card.type === "open" && todo && (
            <div className="mt-5 grid gap-3">
              <p className="text-[0.95rem]">{d.open}</p>
              <div className="rounded-card bg-surface p-4">
                <p className="text-[0.85rem] font-semibold text-muted">
                  {d.criteria}
                </p>
                <p className="mt-1 leading-snug">{card.successCriteria}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={busy !== null}
                onClick={() => send({ action: "done", cardId: card.id })}
              >
                {d.done}
              </button>
            </div>
          )}

          {/* Карточка готова */}
          {!todo && (
            <div
              role="status"
              className={`mt-5 rounded-card p-4 leading-snug ${state.status === "self_wrong" ? "bg-help-soft" : "bg-mint"}`}
            >
              <p className="font-semibold">
                {state.status === "correct"
                  ? d.correct
                  : state.status === "done"
                    ? d.doneText
                    : state.status === "self_correct"
                      ? d.selfCorrect
                      : d.selfWrong}
              </p>
            </div>
          )}
          {!todo && nextOpen && (
            <button
              type="button"
              className="btn btn-primary mt-3 w-full"
              onClick={() => open(nextOpen)}
            >
              {d.next}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="arrow size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 8h10M8.5 4l4 4-4 4" />
              </svg>
            </button>
          )}
          {!todo && !nextOpen && trainer && (
            <button
              type="button"
              className="btn btn-primary mt-3 w-full"
              onClick={openTrainer}
            >
              {d.trainer.nav}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="arrow size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 8h10M8.5 4l4 4-4 4" />
              </svg>
            </button>
          )}

          {/* Подсказки: по одной, не больше трёх */}
          {state.hintTexts.length > 0 && (
            <ol className="mt-5 grid gap-2">
              {state.hintTexts.map((text, i) => (
                <li
                  key={i}
                  className="rounded-card rounded-bl-md bg-mint-soft px-4 py-3"
                >
                  <p className="text-[0.78rem] font-semibold text-ink/70">
                    {t(d.hintLabel, { n: i + 1 })}
                  </p>
                  <p className="mt-0.5 leading-snug">{text}</p>
                  <ReadAloud key={`${card.id}:hint:${i}`} text={text} grade={view.grade} language={view.language} lang={lang} />
                </li>
              ))}
            </ol>
          )}
          {todo && (
            <div className="mt-5 grid gap-2 border-t border-line pt-5">
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={hintsLeft <= 0 || busy !== null}
                aria-busy={busy === "hint"}
                onClick={hint}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
                </svg>
                {busy === "hint"
                  ? d.hintLoading
                  : hintsLeft > 0
                    ? t(d.hintsLeft, { n: hintsLeft })
                    : d.noHints}
              </button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-card border border-danger/30 bg-danger-soft p-3 leading-snug"
            >
              {error}
            </p>
          )}
        </article>
      )}

      <Sheet
        open={sheet === "rule"}
        title={g.rule}
        closeLabel={g.close}
        onClose={() => setSheet(null)}
      >
        {guide && <RuleCard guide={guide} dict={dict} />}
      </Sheet>
      <Sheet
        open={sheet === "similar"}
        title={g.similarTitle}
        closeLabel={g.close}
        onClose={() => setSheet(null)}
      >
        {similar && (
          <WorkedExample
            key={`${card.id}-${similar.problem}`}
            example={similar}
            dict={dict}
            tryIt={false}
          />
        )}
      </Sheet>

      {/* Помощь учителя */}
      {view.needsHelp ? (
        <div
          role="status"
          className="grid gap-3 rounded-frame border border-help/30 bg-help-soft p-5"
        >
          <p className="leading-snug">{d.helpOn}</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              send(
                { action: "help", cardId: card.id, needsHelp: false },
                "help",
              )
            }
          >
            {d.helpCancel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full text-help"
          disabled={busy !== null}
          aria-busy={busy === "help"}
          onClick={() =>
            send({ action: "help", cardId: card.id, needsHelp: true }, "help")
          }
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
          {d.help}
        </button>
      )}
    </div>
  );
}
