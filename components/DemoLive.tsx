"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDict, type Locale } from "@/lib/i18n";
import { rememberLesson } from "@/lib/local";
import type { LessonPlan } from "@/lib/schema";

/**
 * На странице демо-урока: создать свою копию с кодом для учеников (без вызова модели).
 * Так рецензент проходит весь сценарий: урок → код → телефон ученика → панель учителя.
 */
export function DemoLive({ lang, plan }: { lang: Locale; plan: LessonPlan }) {
  const d = getDict(lang).teacher;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function create() {
    setBusy(true);
    setFailed(false);
    try {
      // Язык копии берёт сервер из адреса запроса: урок из его фикстуры, клиент урок не присылает.
      const response = await fetch(`/api/lessons/demo?lang=${lang}`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const { id, token } = await response.json();
      rememberLesson({ id, token, subject: plan.subject, grades: plan.groups.map((g) => g.grade), language: plan.language, demo: true });
      window.scrollTo(0, 0);
      router.push(`/${lang}/teacher/${id}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="demo-live" className="mt-10 flex flex-col gap-5 rounded-frame bg-stage p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between print:hidden">
      <div className="max-w-2xl">
        <h2 id="demo-live" className="text-[1.25rem] font-semibold tracking-[-0.02em]">{d.demoTitle}</h2>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink/85">{d.demoText}</p>
        {failed && <p role="alert" className="mt-2 text-[0.92rem] font-medium text-danger">{d.demoError}</p>}
      </div>
      <button type="button" className="btn btn-primary shrink-0" disabled={busy} aria-busy={busy} onClick={create}>
        {busy ? d.demoBusy : d.demoButton}
      </button>
    </section>
  );
}
