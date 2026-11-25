"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { canReadAloud, speakReading } from "@/lib/read-aloud";
import { getSpeechDict, type Locale } from "@/lib/i18n";

const supported = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;
function subscribe(callback: () => void) {
  if (!supported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () =>
    window.speechSynthesis.removeEventListener("voiceschanged", callback);
}
// A stable string snapshot avoids fresh getVoices() arrays causing hydration/update loops.
const voiceSnapshot = () =>
  supported()
    ? window.speechSynthesis
        .getVoices()
        .filter((v) => v.localService)
        .map((v) => v.lang)
        .sort()
        .join("|")
    : "";
const serverSnapshot = () => "";
const STOP_READING = "aulsabaq-stop-reading";

export function ReadAloud({
  text,
  grade,
  language,
  lang,
}: {
  text: string;
  grade: number;
  language: Locale;
  lang: Locale;
}) {
  const voices = useSyncExternalStore(subscribe, voiceSnapshot, serverSnapshot);
  const [playing, setPlaying] = useState(false);
  const epoch = useRef(0);
  const d = getSpeechDict(lang);
  useEffect(() => {
    // A second read button clears the old button state even when the browser emits no cancel event.
    const invalidate = () => {
      epoch.current++;
    };
    const stopped = () => {
      invalidate();
      setPlaying(false);
    };
    window.addEventListener(STOP_READING, stopped);
    return () => {
      invalidate();
      window.removeEventListener(STOP_READING, stopped);
      if (supported()) window.speechSynthesis.cancel();
      window.dispatchEvent(new Event(STOP_READING));
    };
  }, [text, language]);
  const available = canReadAloud(
    grade,
    voices.split("|").map((voice) => ({ lang: voice, localService: true })),
    language,
  );
  if (!available) return null;
  function toggle() {
    if (playing) {
      window.speechSynthesis.cancel();
      window.dispatchEvent(new Event(STOP_READING));
      setPlaying(false);
      return;
    }
    try {
      window.dispatchEvent(new Event(STOP_READING));
      const generation = ++epoch.current;
      setPlaying(
        speakReading(
          text,
          language,
          window.speechSynthesis,
          (value) => new SpeechSynthesisUtterance(value),
          () => {
            if (epoch.current === generation) setPlaying(false);
          },
        ),
      );
    } catch {
      setPlaying(false);
    }
  }
  return (
    <button
      type="button"
      className="btn btn-secondary mt-3 min-h-11 gap-2 px-3 text-sm"
      aria-pressed={playing}
      onClick={toggle}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="size-4"
      >
        <path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </svg>
      {playing ? d.stop : d.read}
    </button>
  );
}
