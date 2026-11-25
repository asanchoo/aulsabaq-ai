import type { Lang } from "./schema";

export const speechLanguage = (language: Lang) =>
  language === "kk" ? "kk-KZ" : "ru-RU";

/** Remote vendor voices can send text off-device; only a local voice satisfies the no-server requirement. */
export function readingVoice<T extends { lang: string; localService: boolean }>(
  voices: T[],
  language: Lang,
): T | null {
  return (
    voices.find(
      (voice) =>
        voice.localService &&
        voice.lang.replace(/_/g, "-").toLowerCase() ===
          speechLanguage(language).toLowerCase(),
    ) ??
    voices.find(
      (voice) =>
        voice.localService &&
        voice.lang.toLowerCase().split(/[-_]/)[0] === language,
    ) ??
    null
  );
}

export function canReadAloud(
  grade: number,
  voices: { lang: string; localService: boolean }[],
  language: Lang,
): boolean {
  return grade >= 1 && grade <= 2 && readingVoice(voices, language) !== null;
}

/** Inject the browser adapter for tests; the only output is a local SpeechSynthesis utterance. */
export function speakReading(
  text: string,
  language: Lang,
  synthesis: Pick<SpeechSynthesis, "getVoices" | "speak" | "cancel">,
  create: (text: string) => SpeechSynthesisUtterance,
  done: () => void,
): boolean {
  const voice = readingVoice(synthesis.getVoices(), language);
  if (!voice || !text.trim()) return false;
  synthesis.cancel();
  const utterance = create(text);
  utterance.lang = speechLanguage(language);
  utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.onend = done;
  utterance.onerror = done;
  synthesis.speak(utterance);
  return true;
}
