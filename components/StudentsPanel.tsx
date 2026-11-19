"use client";

import { useCallback, useEffect, useState } from "react";
import { t, type Dict } from "@/lib/i18n";
import type { LessonPlan } from "@/lib/schema";
import { isFinished, isStruggling, type CardState, type CardStatus } from "@/lib/student";
import { groupTitle } from "@/lib/lesson";

type StudentRow = {
  id: string;
  name: string;
  groupId: string;
  currentCard: string | null;
  needsHelp: boolean;
  helpCard: string | null;
  hintsUsed: number;
  updatedAt: string;
  cards: Record<string, { status: CardStatus; attempts: number; hints: number; lastAnswer: string | null }>;
};

const POLL_MS = 5000;

const asState = (c: StudentRow["cards"][string] | undefined): CardState | undefined =>
  c ? { status: c.status, attempts: c.attempts, hints: c.hints, hintTexts: [], revealed: false } : undefined;

/**
 * Панель учителя: кто вошёл, кто на какой карточке, кто просит помощи и где классу было трудно.
 * Опрашивает сервер раз в 5 секунд, пока вкладка открыта (SPEC §4: polling проще Realtime и хватает для урока).
 */
export function StudentsPanel({ lessonId, token, plan, joinCode, dict }: { lessonId: string; token: string; plan: LessonPlan; joinCode: string; dict: Dict }) {
  const d = dict.teacher;
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/lessons/${lessonId}/students`, { headers: { "x-teacher-token": token }, cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      setStudents(data.students);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [lessonId, token]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  async function helped(sessionId: string) {
    setStudents((list) => list?.map((s) => (s.id === sessionId ? { ...s, needsHelp: false } : s)) ?? null);
    await fetch(`/api/lessons/${lessonId}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-teacher-token": token },
      body: JSON.stringify({ action: "clear_help", sessionId }),
    }).catch(() => undefined);
    void load();
  }

  const groupOf = (id: string) => plan.groups.find((g) => g.id === id);
  const gradeOf = (id: string) => {
    const g = groupOf(id);
    return g ? groupTitle(plan.groups, g, dict.common) : "";
  };
  const cardNo = (groupId: string, cardId: string | null) => (groupOf(groupId)?.cards.findIndex((c) => c.id === cardId) ?? -1) + 1;

  const help = (students ?? []).filter((s) => s.needsHelp);
  const hard = plan.groups.flatMap((g) => {
    const own = (students ?? []).filter((s) => s.groupId === g.id);
    return g.cards
      .map((c, i) => ({ g, n: i + 1, k: own.filter((s) => isStruggling(asState(s.cards[c.id]))).length, m: own.length }))
      .filter((x) => x.k >= 2 || (x.k >= 1 && x.k / Math.max(1, x.m) >= 0.3));
  }).sort((a, b) => b.k - a.k);

  return (
    <section aria-labelledby="students" className="mt-6 rounded-frame border border-line bg-white p-5 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="students" className="text-[1.3rem] font-semibold tracking-[-0.02em]">{d.studentsTitle}</h2>
          <p className="mt-1 text-[0.88rem] text-muted">{d.studentsLead}</p>
        </div>
        {offline && <p role="status" className="text-[0.88rem] text-help">{d.offline}</p>}
      </div>

      {students && students.length === 0 && (
        <p className="mt-5 max-w-2xl rounded-card bg-surface p-4 text-[0.95rem] leading-relaxed">{t(d.studentsEmpty, { code: joinCode })}</p>
      )}

      {help.length > 0 && (
        <div role="alert" className="mt-5 rounded-card border border-help/30 bg-help-soft p-4">
          <h3 className="flex items-center gap-2 font-semibold text-help">
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
            {d.helpTitle}
          </h3>
          <ul className="mt-3 grid gap-2">
            {help.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-btn bg-white px-3 py-2">
                <span className="font-medium">{t(d.helpRow, { name: s.name, grade: gradeOf(s.groupId), n: cardNo(s.groupId, s.helpCard) || "?" })}</span>
                <button type="button" onClick={() => helped(s.id)} className="btn btn-secondary btn-sm">{d.helped}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {students && students.length > 0 && (
        <div className={`mt-5 grid gap-4 ${plan.groups.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
          {plan.groups.map((g) => {
            const own = students.filter((s) => s.groupId === g.id);
            const done = own.reduce((sum, s) => sum + g.cards.filter((c) => isFinished(asState(s.cards[c.id]))).length, 0);
            return (
              <div key={g.id} className="rounded-card bg-surface p-4">
                <h3 className="font-semibold">{groupTitle(plan.groups, g, dict.common)}</h3>
                <p className="tabular text-[0.85rem] text-muted">{t(d.classSummary, { n: own.length, a: done, b: own.length * g.cards.length })}</p>
                <ul className="mt-3 grid gap-2">
                  {own.map((s) => {
                    const finished = g.cards.filter((c) => isFinished(asState(s.cards[c.id]))).length;
                    return (
                      <li key={s.id} className="rounded-btn bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-medium">{s.name}</span>
                          <span className="tabular shrink-0 text-[0.85rem] text-muted">{t(d.finished, { a: finished, b: g.cards.length })}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {g.cards.map((c, i) => {
                            const state = asState(s.cards[c.id]);
                            const hardHere = isStruggling(state);
                            const current = s.currentCard === c.id && !isFinished(state);
                            const label = `${t(dict.common.card, { n: i + 1 })}: ${d.status[state?.status ?? "todo"]}${current ? `, ${d.current}` : ""}`;
                            return (
                              <span
                                key={c.id}
                                title={label}
                                className={`tabular grid size-6 place-items-center rounded-full text-[0.7rem] font-semibold ${
                                  isFinished(state) ? (state?.status === "self_wrong" ? "bg-help-soft text-help" : "bg-mint text-ink") : hardHere ? "bg-help-soft text-help" : "border border-line-strong text-muted"
                                } ${current ? "ring-2 ring-ink ring-offset-1" : ""}`}
                              >
                                <span className="sr-only">{label}</span>
                                <span aria-hidden>{i + 1}</span>
                              </span>
                            );
                          })}
                          {s.hintsUsed > 0 && <span className="ml-1 text-[0.8rem] text-muted">{t(d.hints, { n: s.hintsUsed })}</span>}
                        </div>
                        {Object.keys(s.cards).length > 0 && (
                          <details className="mt-1.5 text-[0.85rem]">
                            <summary className="link inline-flex min-h-8 cursor-pointer items-center text-muted">{d.details}</summary>
                            <ul className="mt-1 grid gap-1 text-ink/85">
                              {g.cards.map((c, i) => {
                                const st = s.cards[c.id];
                                if (!st) return null;
                                return (
                                  <li key={c.id}>
                                    {t(dict.common.card, { n: i + 1 })}: {d.status[st.status]}
                                    {st.attempts > 0 && `, ${t(d.attempts, { n: st.attempts })}`}
                                    {st.lastAnswer && `, ${t(d.lastAnswer, { a: st.lastAnswer })}`}
                                    {st.hints > 0 && `, ${t(d.hints, { n: st.hints })}`}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {hard.length > 0 && (
        <div className="mt-5 rounded-card border border-line p-4">
          <h3 className="font-semibold">{d.hardTitle}</h3>
          <ul className="mt-2 grid gap-1 text-[0.95rem]">
            {hard.map((x) => (
              <li key={`${x.g.id}-${x.n}`} className="tabular">{t(d.hardRow, { grade: groupTitle(plan.groups, x.g, dict.common), n: x.n, k: x.k, m: x.m })}</li>
            ))}
          </ul>
          <p className="mt-2 text-[0.85rem] text-muted">{d.hardHint}</p>
        </div>
      )}
    </section>
  );
}
