"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getVariantsDict, type Locale } from "@/lib/i18n";

export function NumberVariantsControl({
  lessonId,
  token,
  enabled,
  lang,
  running,
}: {
  lessonId: string;
  token: string;
  enabled: boolean;
  lang: Locale;
  running: boolean;
}) {
  const d = getVariantsDict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Persist in the existing lesson JSON; changing numbers during an active lesson is intentionally disabled.
  async function toggle() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-teacher-token": token,
        },
        body: JSON.stringify({ numberVariants: !enabled }),
      });
      if (!response.ok) throw new Error("save");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        className="btn-secondary min-h-11"
        aria-pressed={enabled}
        disabled={busy || running}
        onClick={() => void toggle()}
      >
        {d.enabled}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {d.error}
        </p>
      )}
    </div>
  );
}
