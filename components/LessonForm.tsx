"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LessonRequestSchema } from "@/lib/generation-schema";
import { parseLessonPlan } from "@/lib/validate";
import { getCreationDict, getDict, t, type Locale } from "@/lib/i18n";

type GroupDraft = { id: number; grade: number; topic: string; count: string };

const GRADES = Array.from({ length: 11 }, (_, i) => i + 1);

/**
 * Форма совмещённого урока. Логика та же, что в День 3:
 * Zod на клиенте → POST /api/lessons → parseLessonPlan → sessionStorage → страница предпросмотра.
 * Справа живой предпросмотр: дорожки выбранных классов, пока урок не собран.
 */
export function LessonForm({ lang }: { lang: Locale }) {
  const d = getCreationDict(lang);
  const dict = getDict(lang);
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [groups, setGroups] = useState<GroupDraft[]>([
    { id: 1, grade: 2, topic: "", count: "" },
    { id: 2, grade: 4, topic: "", count: "" },
  ]);
  const [language, setLanguage] = useState<Locale>(lang);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<keyof typeof d.errors | null>(null);

  // Пока ждём ответ модели, отмечаем шаги по очереди: учителю видно, что работа идёт.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, d.steps.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [busy, d.steps.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    const input = LessonRequestSchema.safeParse({
      subject,
      language,
      durationMin: Number(data.get("duration")),
      groups: groups.map((g) => ({ grade: g.grade, topic: g.topic, ...(g.count ? { studentCount: Number(g.count) } : {}) })),
    });
    if (!input.success) {
      setError("bad_request");
      return;
    }
    setStep(0);
    setBusy(true);
    try {
      const response = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(Object.hasOwn(d.errors, result.error) ? result.error : "provider");
        return;
      }
      const plan = parseLessonPlan(result.plan);
      if (!plan.ok) {
        setError("invalid_plan");
        return;
      }
      try {
        sessionStorage.setItem("aulsabaq-preview", JSON.stringify({ plan: plan.plan, demo: result.demo === true }));
      } catch {
        setError("storage");
        return;
      }
      router.push(`/${lang}/teacher/preview`);
    } catch {
      setError("provider");
    } finally {
      setBusy(false);
    }
  }

  function update(id: number, patch: Partial<GroupDraft>) {
    setGroups((items) => items.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    setGroups((gs) => [
      ...gs,
      { id: Math.max(...gs.map((g) => g.id)) + 1, grade: GRADES.find((n) => !gs.some((g) => g.grade === n)) ?? 1, topic: "", count: "" },
    ]);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <form onSubmit={submit} className="lg:col-span-7" noValidate>
        <fieldset disabled={busy} className="grid gap-8 disabled:opacity-60">
          {/* Предмет: поле и быстрые варианты */}
          <div>
            <label htmlFor="subject" className="field-label">
              {d.subject}
            </label>
            <input
              id="subject"
              className="field"
              name="subject"
              placeholder={d.subjectPlaceholder}
              required
              maxLength={100}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={error === "bad_request" && !subject.trim() ? true : undefined}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {d.subjectChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={subject === chip}
                  onClick={() => setSubject(chip)}
                  className="min-h-10 rounded-full border border-line px-3.5 text-[0.88rem] font-medium transition-colors hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Язык урока: две кнопки-переключателя */}
            <fieldset>
              <legend className="field-label">{d.language}</legend>
              <div className="grid grid-cols-2 rounded-btn border border-line-strong p-1">
                {(["kk", "ru"] as const).map((code) => (
                  <label key={code} className="relative">
                    <input
                      type="radio"
                      name="language"
                      value={code}
                      checked={language === code}
                      onChange={() => setLanguage(code)}
                      className="peer sr-only"
                    />
                    <span className="grid min-h-10 cursor-pointer place-items-center rounded-[6px] text-[0.92rem] font-semibold text-muted transition-colors peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink hover:text-ink peer-checked:hover:text-white">
                      {d.languageNames[code]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="duration" className="field-label">
                {d.duration}
              </label>
              <input id="duration" className="field tabular" name="duration" type="number" min={30} max={90} step={1} defaultValue={45} required />
            </div>
          </div>

          {/* Классы в кабинете */}
          <div>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">{d.groups}</h2>
              <span className="font-mono text-[0.85rem] text-faint">{groups.length} / 3</span>
            </div>
            <div className="grid gap-4">
              {groups.map((group, index) => {
                const taken = new Set(groups.filter((g) => g.id !== group.id).map((g) => g.grade));
                return (
                  <section key={group.id} aria-label={t(d.group, { n: index + 1 })} className="rounded-card border border-line bg-surface p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{t(d.group, { n: index + 1 })}</h3>
                      {groups.length > 2 && (
                        <button
                          type="button"
                          className="link min-h-10 px-1 text-[0.88rem] text-muted hover:text-ink"
                          onClick={() => setGroups((gs) => gs.filter((g) => g.id !== group.id))}
                        >
                          {d.remove}
                        </button>
                      )}
                    </div>

                    <fieldset>
                      <legend className="field-label">{d.grade}</legend>
                      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
                        {GRADES.map((n) => (
                          <label key={n} title={taken.has(n) ? t(d.gradeTaken, { n }) : undefined}>
                            <input
                              type="radio"
                              name={`grade-${group.id}`}
                              value={n}
                              checked={group.grade === n}
                              disabled={taken.has(n)}
                              onChange={() => update(group.id, { grade: n })}
                              className="peer sr-only"
                            />
                            <span className="tabular grid min-h-11 cursor-pointer place-items-center rounded-btn border border-line bg-white font-semibold transition-colors hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:bg-transparent peer-disabled:text-faint/60">
                              {n}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_11rem]">
                      <div>
                        <label htmlFor={`topic-${group.id}`} className="field-label">
                          {d.topic}
                        </label>
                        <input
                          id={`topic-${group.id}`}
                          className="field"
                          placeholder={d.topicPlaceholder}
                          required
                          maxLength={300}
                          value={group.topic}
                          onChange={(e) => update(group.id, { topic: e.target.value })}
                          aria-invalid={error === "bad_request" && !group.topic.trim() ? true : undefined}
                        />
                      </div>
                      <div>
                        <label htmlFor={`count-${group.id}`} className="field-label">
                          {d.count}
                        </label>
                        <input
                          id={`count-${group.id}`}
                          className="field tabular"
                          placeholder={d.countPlaceholder}
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={group.count}
                          onChange={(e) => update(group.id, { count: e.target.value })}
                        />
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {groups.length < 3 && (
              <button
                type="button"
                onClick={addGroup}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                {d.add}
              </button>
            )}
          </div>
        </fieldset>

        {error && (
          <div role="alert" className="mt-6 flex gap-3 rounded-card border border-danger/30 bg-danger-soft p-4 text-ink">
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.5" />
            </svg>
            <p className="leading-snug">{d.errors[error]}</p>
          </div>
        )}

        <div className="mt-8 grid gap-3">
          <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary w-full">
            {busy ? d.loading : d.submit}
            {!busy && (
              <svg aria-hidden viewBox="0 0 16 16" className="arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 8h10M8.5 4l4 4-4 4" />
              </svg>
            )}
          </button>
          <Link className="link mx-auto py-2 text-[0.92rem] text-muted hover:text-ink" href={`/${lang}/teacher/demo`}>
            {d.demo}
          </Link>
        </div>
      </form>

      {/* Предпросмотр: дорожки выбранных классов, а во время сборки шаги проверки */}
      <aside aria-live="polite" className="lg:col-span-5">
        <div className="rounded-frame bg-stage p-5 sm:p-6 lg:sticky lg:top-24">
          <div className="rounded-card bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{d.previewTitle}</p>
              <span className="font-mono text-[0.8rem] text-faint">{subject.trim() || "…"}</span>
            </div>
            <div className="mt-5 grid gap-2.5">
              {[...groups]
                .sort((a, b) => a.grade - b.grade)
                .map((g) => (
                  <div key={g.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                    <span className="text-[0.85rem] font-semibold whitespace-nowrap">{t(dict.common.grade, { n: g.grade })}</span>
                    <span className={`h-9 rounded-md border border-dashed border-line-strong ${busy ? "animate-pulse bg-mint-soft" : ""}`} />
                  </div>
                ))}
            </div>
            {!busy ? (
              <p className="mt-5 text-[0.88rem] text-muted">{d.previewEmpty}</p>
            ) : (
              <ol className="mt-6 grid gap-2.5 border-t border-line pt-5">
                {d.steps.map((label, i) => (
                  <li key={label} className={`flex items-center gap-3 text-[0.9rem] ${i <= step ? "text-ink" : "text-faint"}`}>
                    <span
                      aria-hidden
                      className={`grid size-5 shrink-0 place-items-center rounded-full ${
                        i < step ? "bg-ink text-white" : i === step ? "border-2 border-ink" : "border border-line-strong"
                      }`}
                    >
                      {i < step && (
                        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {busy && <p className="mt-5 text-[0.85rem] leading-snug text-muted">{d.waiting}</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
