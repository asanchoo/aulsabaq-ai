"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getDict, t, type Locale } from "@/lib/i18n";
import { rememberLesson, useSavedLessons } from "@/lib/local";
import type { LessonPlan } from "@/lib/schema";
import { LessonEditor } from "./LessonEditor";
import { LessonRunner, startRun, useRunning } from "./LessonRunner";
import { StudentsPanel } from "./StudentsPanel";

const noop = () => () => {};
/** Адрес сайта для подписи «ученики открывают …/join». На сервере — основной домен. */
function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => "https://aulsabaq-ai.vercel.app");
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Всё, что учитель делает с сохранённым уроком в классе: код для учеников, ведение урока по таймеру,
 * правка, панель учеников. Ключ учителя хранится в браузере (lib/local.ts); без него урок открыт только для просмотра.
 */
export function TeacherWorkspace({ lessonId, joinCode, plan, lang, isDemo }: { lessonId: string; joinCode: string; plan: LessonPlan; lang: Locale; isDemo: boolean }) {
  const dict = getDict(lang);
  const d = dict.teacher;
  const origin = useOrigin();
  const token = useSavedLessons().find((l) => l.id === lessonId)?.token ?? null;
  const running = useRunning(lessonId);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string[] | null>(null);
  const [manualLink, setManualLink] = useState<"join" | "owner" | null>(null);
  const [copied, setCopied] = useState<"join" | "owner" | null>(null);

  // «Ссылка для себя» несёт ключ учителя после # (на сервер он не уходит): запоминаем и убираем из адреса.
  useEffect(() => {
    const match = window.location.hash.match(/[#&]t=([\w-]{20,})/);
    if (!match) return;
    rememberLesson({ id: lessonId, token: match[1], subject: plan.subject, grades: plan.groups.map((g) => g.grade), language: plan.language, demo: isDemo });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [lessonId, plan, isDemo]);

  const joinUrl = `${origin}/${plan.language}/join?code=${joinCode}`;
  const site = `${origin.replace(/^https?:\/\//, "")}/join`;
  const ownerUrl = token ? `${origin}/${lang}/teacher/${lessonId}#t=${token}` : "";

  async function copyLink(kind: "join" | "owner") {
    if (await copy(kind === "join" ? joinUrl : ownerUrl)) {
      setCopied(kind);
      setManualLink(null);
      setTimeout(() => setCopied(null), 2000);
    } else {
      setManualLink(kind);
    }
  }

  return (
    <>
      <section aria-labelledby="in-class" className="mt-10 grid gap-4 lg:grid-cols-12 print:hidden">
        <h2 id="in-class" className="sr-only">{d.codeTitle}</h2>
        <div className="rounded-frame bg-stage p-5 sm:p-6 lg:col-span-5">
          <p className="text-[0.9rem] font-semibold">{d.codeTitle}</p>
          <p className="tabular mt-2 font-mono text-[3rem] leading-none font-semibold tracking-[0.08em] sm:text-[3.6rem]" aria-label={joinCode.split("").join(" ")}>
            {joinCode.slice(0, 3)} {joinCode.slice(3)}
          </p>
          <p className="mt-3 text-[0.92rem] leading-snug text-ink/85">{t(d.codeHint, { site })}</p>
          <button type="button" onClick={() => copyLink("join")} className="link mt-3 inline-flex min-h-10 items-center text-[0.9rem] font-semibold" aria-live="polite">
            {copied === "join" ? d.copied : d.copyJoin}
          </button>
          {manualLink === "join" && <input className="field mt-2 w-full" aria-label={d.copyJoin} readOnly value={joinUrl} onFocus={(e) => e.currentTarget.select()} />}
        </div>

        <div className="flex flex-col justify-between gap-5 rounded-frame border border-line p-5 sm:p-6 lg:col-span-7">
          {token ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className="btn btn-primary" disabled={running} onClick={() => startRun(lessonId)}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2M9 2h6" />
                  </svg>
                  {d.run}
                </button>
                <button type="button" className="btn btn-secondary" aria-expanded={editing} onClick={() => { setNotice(null); setEditing((v) => !v); }}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  {d.edit}
                </button>
              </div>
              <div>
                <button type="button" onClick={() => copyLink("owner")} className="link inline-flex min-h-10 items-center text-[0.9rem] font-semibold" aria-live="polite">
                  {copied === "owner" ? d.copied : d.ownerLink}
                </button>
                <p className="text-[0.85rem] leading-snug text-muted">{d.ownerLinkHint}</p>
                {manualLink === "owner" && <input className="field mt-2 w-full" aria-label={d.ownerLink} readOnly value={ownerUrl} onFocus={(e) => e.currentTarget.select()} />}
              </div>
            </>
          ) : (
            <p className="text-[0.95rem] leading-relaxed text-ink/85">{d.viewOnly}</p>
          )}
          <p className="text-[0.85rem] text-muted">{dict.run.hint}</p>
        </div>
      </section>

      {notice && (
        <div role="status" className="mt-6 rounded-card border border-line bg-surface p-4 text-[0.95rem] print:hidden">
          <ul className="grid gap-1">{notice.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      {token && editing && (
        <LessonEditor
          lessonId={lessonId}
          token={token}
          plan={plan}
          dict={dict}
          onClose={(saved) => {
            setEditing(false);
            if (saved) setNotice(saved.warnings.length ? [dict.edit.warnings, ...saved.warnings] : [dict.edit.savedOk]);
          }}
        />
      )}

      {token && <StudentsPanel lessonId={lessonId} token={token} plan={plan} joinCode={joinCode} dict={dict} lang={lang} />}
      <LessonRunner lessonId={lessonId} plan={plan} dict={dict} />
    </>
  );
}
