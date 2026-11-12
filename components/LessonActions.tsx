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
      // Буфер обмена недоступен (старый браузер, нет https) — тихо игнорируем.
    }
  }

  const base =
    "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors";

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${base} bg-ink text-paper hover:bg-blue-deep`}>
        {labels.print}
      </button>
      <button
        type="button"
        onClick={copy}
        className={`${base} border border-rule bg-card text-ink hover:border-ink-faint`}
        aria-live="polite"
      >
        {copied ? `✓ ${labels.copied}` : labels.copy}
      </button>
    </div>
  );
}
