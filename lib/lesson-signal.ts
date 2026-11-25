"use client";

export const SOUND_KEY = "aulsabaq-sound";
let audio: AudioContext | null = null;
export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}
/** Call from a click: browser audio requires a user gesture. No microphone or audio files. */
export function enableSound(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
    window.dispatchEvent(new Event("aulsabaq-local-change"));
  } catch {
    /* no persistence */
  }
  if (enabled) {
    try {
      audio ??= new AudioContext();
      void audio.resume().catch(() => undefined);
    } catch {
      /* unsupported */
    }
  }
}
export function lessonSignal() {
  try {
    navigator.vibrate?.(120);
  } catch {
    /* unsupported */
  }
  if (!soundEnabled() || !audio || audio.state !== "running") return;
  try {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.connect(gain);
    gain.connect(audio.destination);
    tone.frequency.value = 740;
    const at = audio.currentTime;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    tone.start(at);
    tone.stop(at + 0.22);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
  } catch {
    /* sound is optional */
  }
}
