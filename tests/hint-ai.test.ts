import { afterEach, describe, expect, it, vi } from "vitest";
import { generateHint } from "@/lib/ai";
import { retryTiming } from "@/lib/providers";
import type { TaskCard } from "@/lib/schema";

retryTiming.delaysMs = [0, 0];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const card: TaskCard = { id: "g2-c3", type: "closed", prompt: "Раздели столбиком: 864 : 4", answer: "216", successCriteria: "Проверка умножением даёт 864", hint: "Начни с сотен", difficulty: 2, purpose: "practice" };
const request = { language: "ru" as const, subject: "Математика", grade: 4, topic: "Деление", card, studentAnswer: "214", previousHints: ["Начни с сотен"] };

function setup() {
  for (const k of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY"]) vi.stubEnv(k, "");
  vi.stubEnv("GEMINI_API_KEY", "gemini-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-3-test");
}
const reply = (hint: string) => Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({ hint }) }] } }] });

describe("generateHint: подсказка ИИ ученику", () => {
  it("guard отбрасывает подсказку с ответом и просит другую", async () => {
    setup();
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply("Получится 216, проверь."))
      .mockResolvedValueOnce(reply("Сколько десятков осталось после сотен? Раздели их на 4."));
    vi.stubGlobal("fetch", fetch);
    await expect(generateHint(request)).resolves.toBe("Сколько десятков осталось после сотен? Раздели их на 4.");
    expect(fetch).toHaveBeenCalledTimes(2);
    // Во второй запрос модели уходит отклонённая подсказка и ответ ученика, но не сам эталон в тексте для ученика.
    const second = JSON.parse(JSON.parse(String(fetch.mock.calls[1][1].body)).contents[0].parts[0].text);
    expect(second.rejectedBecauseTheyRevealTheAnswer).toEqual(["Получится 216, проверь."]);
    expect(second.studentAnswer).toBe("214");
  });

  it("если модель дважды выдаёт ответ, возвращает null (роут отдаст запасную подсказку)", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn(async () => reply("Ответ 216")));
    await expect(generateHint(request)).resolves.toBeNull();
  });

  it("без ключа модели возвращает null, а не падает", async () => {
    for (const k of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"]) vi.stubEnv(k, "");
    await expect(generateHint(request)).resolves.toBeNull();
  });
});
