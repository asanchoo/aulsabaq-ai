"use client";

import { useState } from "react";

type Props = { text: string; labels: { print: string; copy: string; copied: string } };

/** «Распечатать карточки» и «Скопировать урок». Текст урока готовит сервер. */
export function LessonActions({ text, labels }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен (старый браузер, нет https): тихо игнорируем.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row print:hidden">
      <button type="button" onClick={() => window.print()} className="btn btn-primary">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v7H6z" />
        </svg>
        {labels.print}
      </button>
      <button type="button" onClick={copy} className="btn btn-secondary" aria-live="polite">
        {copied ? (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
