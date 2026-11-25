"use client";
import { useEffect, useState } from "react";
import { getCurriculumDict, type Locale } from "@/lib/i18n";

export function CurriculumPicker({ subject, grade, language, quarter, onQuarter, onTopic }: {
  subject: string; grade: number; language: Locale; quarter?: number;
  onQuarter: (quarter?: number) => void; onTopic: (topic: string) => void;
}) {
  const d = getCurriculumDict(language);
  const [topics, setTopics] = useState<string[]>([]);
  // Abort stale responses when the teacher changes class or subject quickly.
  useEffect(() => {
    const abort = new AbortController();
    if (!quarter) return;
    const query = new URLSearchParams({ subject, grade: String(grade), language, quarter: String(quarter) });
    void fetch(`/api/curriculum?${query}`, { signal: abort.signal }).then((r) => r.json())
      .then((data: { topics: string[] }) => setTopics(data.topics)).catch(() => {});
    return () => abort.abort();
  }, [subject, grade, language, quarter]);
  return <div className="mt-3">
    <fieldset><legend className="field-label">{d.quarter}</legend>
      <div className="flex gap-2">{[1, 2, 3, 4].map((n) => <button type="button" key={n}
        className="btn-secondary min-h-11 min-w-11" aria-pressed={quarter === n}
        onClick={() => onQuarter(quarter === n ? undefined : n)}>{n}</button>)}</div>
    </fieldset>
    {!!quarter && topics.length > 0 && <div className="mt-3 grid gap-2" aria-label={d.topics}>
      {topics.map((topic) => <button key={topic} type="button" className="btn-secondary min-h-11 text-left text-sm"
        onClick={() => onTopic(topic)}>{topic}</button>)}
    </div>}
  </div>;
}
