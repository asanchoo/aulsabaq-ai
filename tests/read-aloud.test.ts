import { expect, it, vi } from "vitest";
import { canReadAloud, readingVoice, speakReading } from "../lib/read-aloud";
const voice = (lang: string, localService = true) =>
  ({ lang, localService }) as SpeechSynthesisVoice;
it("предпочитает точный местный язык карточки, не подменяет его другим", () => {
  const ru = voice("ru-RU"),
    kk = voice("kk-KZ");
  expect(readingVoice([voice("en-US"), voice("ru-KZ"), ru, kk], "ru")).toBe(ru);
  expect(readingVoice([ru, kk], "kk")).toBe(kk);
  expect(readingVoice([ru], "kk")).toBeNull();
});
it("не предлагает чтение без местного голоса и вне 1–2 классов", () => {
  for (const grade of [0, 3, 4, 9])
    expect(canReadAloud(grade, [voice("ru-RU")], "ru")).toBe(false);
  for (const grade of [1, 2])
    expect(canReadAloud(grade, [voice("ru-RU")], "ru")).toBe(true);
  expect(canReadAloud(2, [], "ru")).toBe(false);
  expect(canReadAloud(1, [voice("kk-KZ", false)], "kk")).toBe(false);
});
it("читает ровно текст экрана с kk-KZ и останавливает предыдущую очередь", () => {
  const kk = voice("kk-KZ");
  const order: string[] = [];
  const utterance = {} as SpeechSynthesisUtterance;
  const create = vi.fn(() => utterance),
    done = vi.fn();
  const synthesis = {
    getVoices: () => [voice("ru-RU"), kk],
    cancel: () => order.push("cancel"),
    speak: () => order.push("speak"),
  };
  expect(speakReading("Есепте: 28 + 5", "kk", synthesis, create, done)).toBe(
    true,
  );
  expect(create).toHaveBeenCalledWith("Есепте: 28 + 5");
  expect(utterance.lang).toBe("kk-KZ");
  expect(utterance.voice).toBe(kk);
  expect(utterance.rate).toBe(0.85);
  expect(order).toEqual(["cancel", "speak"]);
  utterance.onend!.call(utterance, {} as SpeechSynthesisEvent);
  expect(done).toHaveBeenCalledTimes(1);
});
it("не запускает чтение пустого текста или удалённого голоса", () => {
  const speak = vi.fn(),
    cancel = vi.fn(),
    create = vi.fn();
  const synthesis = { speak, cancel, getVoices: () => [voice("ru-RU", false)] };
  expect(speakReading("Задание", "ru", synthesis, create, vi.fn())).toBe(false);
  expect(
    speakReading(
      "",
      "ru",
      { ...synthesis, getVoices: () => [voice("ru-RU")] },
      create,
      vi.fn(),
    ),
  ).toBe(false);
  expect(speak).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
it("ошибка синтезатора завершает состояние чтения, ru использует ru-RU", () => {
  const utterance = {} as SpeechSynthesisUtterance,
    done = vi.fn();
  speakReading(
    "Вспомни правило",
    "ru",
    { getVoices: () => [voice("ru-RU")], cancel: vi.fn(), speak: vi.fn() },
    () => utterance,
    done,
  );
  expect(utterance.lang).toBe("ru-RU");
  utterance.onerror!.call(utterance, {} as SpeechSynthesisErrorEvent);
  expect(done).toHaveBeenCalledTimes(1);
});
