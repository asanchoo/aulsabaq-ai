"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDict, t, type Locale } from "@/lib/i18n";
import { groupTitle } from "@/lib/lesson";
import { rememberStudent, useLastStudent } from "@/lib/local";

type LessonInfo = { subject: string; language: Locale; groups: { id: string; grade: number; topic: string; language?: Locale }[] };

/**
 * Вход ученика: код урока → свой класс → имя или номер в списке.
 * Без регистрации, почты и телефона. Код можно передать ссылкой: /join?code=123456.
 */
export function JoinFlow({ lang }: { lang: Locale }) {
  const dict = getDict(lang);
  const d = dict.join;
  const router = useRouter();
  const params = useSearchParams();
  const last = useLastStudent();
  const [code, setCode] = useState(() => (params.get("code") ?? "").replace(/\D/g, "").slice(0, 6));
  const [lesson, setLesson] = useState<LessonInfo | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof d.errors | null>(null);

  const errorOf = (code: unknown): keyof typeof d.errors => (typeof code === "string" && code in d.errors ? (code as keyof typeof d.errors) : "storage");

  async function findLesson(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return setError("not_found");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/join?code=${code}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(errorOf(data.error));
      setLesson(data);
      setGroupId(data.groups.length === 1 ? data.groups[0].id : null);
    } catch {
      setError("storage");
    } finally {
      setBusy(false);
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!lesson || !groupId) return;
    if (!name.trim()) return setError("bad_request");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, groupId, name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBusy(false);
        return setError(errorOf(data.error));
      }
      const chosen = lesson.groups.find((g) => g.id === groupId);
      const language = chosen?.language ?? lesson.language;
      rememberStudent({ sessionId: data.sessionId, name: name.trim(), subject: lesson.subject, grade: chosen?.grade ?? 0, language });
      router.push(`/${language}/student/${data.sessionId}`);
    } catch {
      setBusy(false);
      setError("storage");
    }
  }


  return (
    <div className="mx-auto grid w-full max-w-[30rem] grid-cols-[minmax(0,1fr)] gap-8">
      <header>
        <h1 className="display text-[2.4rem] sm:text-[3rem]">{d.title}</h1>
        {!lesson && <p className="mt-3 text-[1.05rem] text-ink/85">{d.lead}</p>}
      </header>

      {!lesson && last && (
        <Link href={`/${last.language}/student/${last.sessionId}`} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:border-ink">
          <span>
            <span className="block font-semibold">{t(d.continue, { name: last.name })}</span>
            <span className="block text-[0.88rem] text-muted">{t(d.continueHint, { subject: last.subject, grade: t(getDict(last.language).common.grade, { n: last.grade }) })}</span>
          </span>
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 8h10M8.5 4l4 4-4 4" />
          </svg>
        </Link>
      )}

      {!lesson ? (
        <form onSubmit={findLesson} noValidate className="grid gap-4">
          <div>
            <label htmlFor="code" className="field-label">{d.code}</label>
            <input
              id="code"
              className="field tabular h-16 text-center font-mono text-[2rem] tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder={d.codePlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={error === "not_found" ? true : undefined}
              aria-describedby={error ? "join-error" : undefined}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6} aria-busy={busy}>
            {busy ? d.checking : d.next}
          </button>
        </form>
      ) : (
        <form onSubmit={join} noValidate className="grid gap-6">
          <p className="rounded-card bg-surface px-4 py-3 font-semibold">{lesson.subject}</p>
          <fieldset>
            <legend className="field-label">{d.chooseGrade}</legend>
            <div className="grid gap-2">
              {lesson.groups.map((g) => (
                <label key={g.id} className="relative block">
                  <input type="radio" name="group" value={g.id} checked={groupId === g.id} onChange={() => setGroupId(g.id)} className="peer sr-only" />
                  <span className="block cursor-pointer rounded-card border border-line-strong bg-white px-4 py-3 transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink hover:border-ink">
                    <span className="block font-semibold">{groupTitle(lesson.groups, g, getDict(g.language ?? lesson.language).common)}</span>
                    <span className="block text-[0.9rem] opacity-80">{g.topic}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="name" className="field-label">{d.name}</label>
            <input
              id="name"
              className="field"
              maxLength={40}
              autoComplete="off"
              placeholder={d.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="name-hint"
              aria-invalid={error === "bad_request" ? true : undefined}
            />
            <p id="name-hint" className="mt-1.5 text-[0.85rem] text-muted">{d.nameHint}</p>
          </div>
          <div className="grid gap-2">
            <button type="submit" className="btn btn-primary w-full" disabled={busy || !groupId} aria-busy={busy}>
              {busy ? d.entering : d.enter}
            </button>
            <button type="button" className="link mx-auto min-h-11 text-[0.92rem] text-muted" onClick={() => { setLesson(null); setError(null); }}>
              {d.back}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p id="join-error" role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-4 leading-snug">
          {d.errors[error]}
        </p>
      )}
    </div>
  );
}
