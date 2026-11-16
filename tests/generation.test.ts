import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lessons/route";
import { demoLesson } from "@/lib/demo";
import { GeneratedContentSchema, LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson } from "@/lib/ai";
import { resolveProvider, retryTiming, toGeminiSchema } from "@/lib/providers";
import { createRateLimiter } from "@/lib/rate-limit";
import { ExplanationSchema, type LessonPlan } from "@/lib/schema";
import { planSchedule } from "@/lib/schedule";
import { validateLessonPlan } from "@/lib/validate";
import { z } from "zod";

const input = {
  subject: demoLesson.subject, language: demoLesson.language, durationMin: demoLesson.durationMin,
  groups: demoLesson.groups.map((g) => ({ grade: g.grade, topic: g.topic })),
};
/** Ответ модели на запрос содержания: карточки демо-урока, столько review и practice, сколько просит расписание. */
function generated() {
  const schedule = planSchedule(input.groups.length, input.durationMin);
  return {
    subject: demoLesson.subject, language: demoLesson.language, durationMin: demoLesson.durationMin,
    opening: "Общий настрой", closing: "Общий итог",
    groups: demoLesson.groups.map((g, i) => ({
      grade: g.grade, topic: g.topic, learningGoal: g.learningGoal, homework: g.homework, reviewTopic: "Прошлая тема",
      cards: g.cards.map((card, k) => {
        const c: Partial<typeof card> = { ...card };
        delete c.id;
        return { ...c, answer: card.answer ?? null, purpose: k < schedule.cards[i].review ? "review" : "practice" };
      }),
      stages: { review: "Повторяют", explain: "Учитель объясняет", practice: "Решают карточки", check: "Учитель проверяет" },
    })),
    teacherNotes: demoLesson.teacherNotes,
  };
}
/** Урок собран: расписание от кода проходит все правила, объяснения на месте, карточки разложены. */
function expectLesson(plan: LessonPlan) {
  expect(validateLessonPlan(plan)).toEqual({ ok: true });
  expect(plan.groups.map((g) => g.explanation)).toEqual(demoLesson.groups.map((g) => g.explanation));
  expect(plan.groups.map((g) => g.cards.map((c) => c.id))).toEqual([
    ["g1-c1", "g1-c2", "g1-c3", "g1-c4", "g1-c5"], ["g2-c1", "g2-c2", "g2-c3", "g2-c4", "g2-c5"],
  ]);
  expect(plan.timeline.find((s) => s.groupId === "g2" && s.mode === "independent")?.cardIds).toEqual(["g2-c1", "g2-c2", "g2-c3"]);
}
function provider(plan: unknown, status = "completed") {
  return Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(plan) }] }] });
}
function clearEnv() { for (const k of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"]) vi.stubEnv(k, ""); }
function setup() { clearEnv(); vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_MODEL", "test-model"); }
function setupGemini() { clearEnv(); vi.stubEnv("GEMINI_API_KEY", "gemini-key"); vi.stubEnv("GEMINI_MODEL", "gemini-3-test"); }
function gemini(plan: unknown, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { role: "model", parts: [{ text: JSON.stringify(plan) }] } }] });
}

/** Что спросили у модели: расписание (в запросе есть request) или объяснение одного класса. */
function requestOf(init: RequestInit): { kind: "plan" | "explain"; data: Record<string, unknown> } {
  const body = JSON.parse(String(init.body));
  const data = JSON.parse(body.input ?? body.contents[0].parts[0].text);
  return { kind: "request" in data ? "plan" : "explain", data };
}

/**
 * Подставная модель: на запросы расписания по очереди отдаёт plans (последний повторяется),
 * на запрос объяснения — объяснение демо-урока для этого класса.
 * Элемент plans — готовый Response (сбой, обрыв) или урок, который завернёт format.
 */
function fakeModel(format: (value: unknown) => Response, plans: unknown[] = [generated()]) {
  let planCalls = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { kind, data } = requestOf(init);
    if (kind === "explain") return format(demoLesson.groups.find((g) => g.grade === data.grade)!.explanation);
    const next = plans[Math.min(planCalls++, plans.length - 1)];
    return next instanceof Response ? next.clone() : format(next);
  });
}
const planCalls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(([, init]) => requestOf(init as RequestInit).kind === "plan");

// Повторы при перегрузке провайдера в тестах без пауз.
retryTiming.delaysMs = [0, 0];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("generation request", () => {
  it("rejects duplicate grades and oversized topics", () => {
    expect(LessonRequestSchema.safeParse({ ...input, groups: [input.groups[0], input.groups[0]] }).success).toBe(false);
    expect(LessonRequestSchema.safeParse({ ...input, groups: input.groups.map((g) => ({ ...g, topic: "x".repeat(301) })) }).success).toBe(false);
  });
  it("has required fields throughout the provider schema", () => {
    function check(schema: Record<string, unknown>) {
      if (schema.type === "object") {
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toEqual(Object.keys(schema.properties as object));
      }
      for (const value of Object.values(schema)) {
        if (value && typeof value === "object") {
          if (Array.isArray(value)) value.forEach((v) => typeof v === "object" && v && check(v));
          else check(value as Record<string, unknown>);
        }
      }
    }
    check(z.toJSONSchema(GeneratedContentSchema, { target: "draft-7" }));
    check(z.toJSONSchema(ExplanationSchema, { target: "draft-7" }));
  });
});

describe("generation", () => {
  it("validates the response and uses the configured model without storing it", async () => {
    setup();
    const fetch = fakeModel(provider); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    // Одно расписание и по объяснению на каждый класс.
    expect(fetch).toHaveBeenCalledTimes(1 + input.groups.length);
    const body = JSON.parse(planCalls(fetch)[0][1].body);
    expect(body.model).toBe("test-model"); expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
  });
  it("asks for content after the explanations and passes their worked examples", async () => {
    setup();
    const fetch = fakeModel(provider); vi.stubGlobal("fetch", fetch);
    await generateLesson(input);
    const kinds = fetch.mock.calls.map(([, init]) => requestOf(init as RequestInit).kind);
    expect(kinds).toEqual(["explain", "explain", "plan"]);
    const request = requestOf(planCalls(fetch)[0][1] as RequestInit).data;
    expect(request.explanations).toEqual(demoLesson.groups.map((g, i) => ({
      group: i + 1, keyIdea: g.explanation.keyIdea, example: g.explanation.example.problem, exampleAnswer: g.explanation.example.answer,
    })));
  });
  it("sends validation errors on a repair attempt", async () => {
    setup(); const broken = generated(); broken.groups[0].cards.pop(); // карточек меньше, чем просит расписание
    const fetch = fakeModel(provider, [broken, generated()]); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    const calls = planCalls(fetch);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(JSON.parse(calls[1][1].body).input).validationErrors.length).toBeGreaterThan(0);
  });
  it("repairs an explanation with a wrong calculation", async () => {
    setup();
    const wrong = structuredClone(demoLesson.groups[0].explanation);
    wrong.example.steps[0] = "Единицы: 6 + 8 = 15.";
    let explainCalls = 0;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { kind, data } = requestOf(init);
      if (kind === "plan") return provider(generated());
      if (data.grade === 2 && explainCalls++ === 0) return provider(wrong);
      return provider(demoLesson.groups.find((g) => g.grade === data.grade)!.explanation);
    });
    vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    expect(explainCalls).toBe(2);
  });
  it("rejects a valid lesson that ignores the requested topic", async () => {
    setup(); const fetch = fakeModel(provider); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson({ ...input, groups: input.groups.map((g) => ({ ...g, topic: "Другая тема" })) })).rejects.toMatchObject({ code: "invalid_plan" });
    expect(planCalls(fetch)).toHaveLength(3); // первая попытка и две повторные
  });
  it("handles refusal without exposing provider content", async () => {
    setup(); const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }))); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "invalid_plan" });
  });
  it("stops on provider/network errors", async () => {
    setup(); const fetch = vi.fn().mockRejectedValue(new Error("network")); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
    // Объяснения идут первыми и падают сразу, до содержания урока дело не доходит.
    expect(fetch).toHaveBeenCalledTimes(input.groups.length);
  });
  it("does not contact provider without configuration", async () => {
    clearEnv(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "not_configured" }); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("provider choice", () => {
  const both = { OPENAI_API_KEY: "o", OPENAI_MODEL: "om", GEMINI_API_KEY: "g", GEMINI_MODEL: "gm" };
  it("uses the configured provider and prefers OpenAI when both are set", () => {
    expect(resolveProvider({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gm" })?.name).toBe("gemini");
    expect(resolveProvider(both)?.name).toBe("openai");
    expect(resolveProvider({ ...both, AI_PROVIDER: "gemini" })?.name).toBe("gemini");
  });
  it("does not fall back silently on a typo or a missing model", () => {
    expect(resolveProvider({ ...both, AI_PROVIDER: "gemeni" })).toBeNull();
    expect(resolveProvider({ OPENAI_API_KEY: "o", AI_PROVIDER: "openai" })).toBeNull();
    expect(resolveProvider({ GEMINI_API_KEY: "g" })).toBeNull();
  });
});

describe("gemini", () => {
  it("sends the schema Gemini understands and the key in a header, not the URL", async () => {
    setupGemini();
    const fetch = fakeModel(gemini); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-test:generateContent");
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gemini-key");
      const config = JSON.parse(String(init.body)).generationConfig;
      const schema = JSON.stringify(config.responseJsonSchema);
      expect(schema).not.toContain("$schema"); expect(schema).not.toContain('"const"');
      expect(config.responseMimeType).toBe("application/json");
      expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" });
    }
  });
  it("turns const into a one-value enum", () => {
    expect(toGeminiSchema({ $schema: "x", anyOf: [{ type: "number", const: 1 }] })).toEqual({ anyOf: [{ type: "number", enum: [1] }] });
  });
  it("repairs after a cut-off answer and skips thought parts", async () => {
    setupGemini();
    const thought = Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "думаю…", thought: true }, { text: JSON.stringify(generated()) }] } }] });
    const fetch = fakeModel(gemini, [gemini(generated(), "MAX_TOKENS"), thought]); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    expect(planCalls(fetch)).toHaveLength(2);
  });
  it("reports a blocked prompt as an invalid plan and an HTTP error as a provider error", async () => {
    setupGemini();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ promptFeedback: { blockReason: "SAFETY" } }))));
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "invalid_plan" });
    const busy = vi.fn().mockImplementation(() => Promise.resolve(new Response("quota", { status: 429 }))); vi.stubGlobal("fetch", busy);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
    // Первое объяснение: запрос и два повтора; остальные могут не успеть до ответа об ошибке.
    expect(busy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it("retries a temporary overload and still returns the lesson", async () => {
    setupGemini();
    const fetch = fakeModel(gemini, [new Response("high demand", { status: 503 }), generated()]); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    expect(planCalls(fetch)).toHaveLength(2);
  });
  it("switches to the next model in GEMINI_MODEL when one stays overloaded", async () => {
    clearEnv(); vi.stubEnv("GEMINI_API_KEY", "gemini-key"); vi.stubEnv("GEMINI_MODEL", "gemini-main, gemini-2.5-spare");
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("gemini-main")) return new Response("high demand", { status: 503 });
      const { kind, data } = requestOf(init);
      return gemini(kind === "plan" ? generated() : demoLesson.groups.find((g) => g.grade === data.grade)!.explanation);
    });
    vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    const spare = fetch.mock.calls.filter(([url]) => url.includes("gemini-2.5-spare"));
    expect(spare).toHaveLength(1 + input.groups.length);
    // У моделей 2.5 нет thinkingLevel: параметр не отправляем.
    expect(JSON.parse(String(spare[0][1].body)).generationConfig.thinkingConfig).toBeUndefined();
  });
  it("does not retry a broken request", async () => {
    setupGemini();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("bad field", { status: 400 }))); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
    expect(fetch).toHaveBeenCalledTimes(input.groups.length); // каждое объяснение по одному разу, без повторов
  });
});

describe("HTTP boundary", () => {
  it("rejects invalid JSON and input", async () => {
    for (const body of ["{", JSON.stringify({ subject: "Math" })]) {
      const result = await POST(new Request("http://localhost/api/lessons", { method: "POST", body }));
      expect(result.status).toBe(400);
    }
  });
  it("returns demo explicitly without calling the model", async () => {
    vi.stubEnv("DEMO_MODE", "true"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await POST(new Request("http://localhost/api/lessons", { method: "POST", body: JSON.stringify(input) }));
    expect(await result.json()).toEqual({ plan: demoLesson, demo: true }); expect(fetch).not.toHaveBeenCalled();
  });
  it("returns a safe error when configuration is absent", async () => {
    vi.stubEnv("DEMO_MODE", "false"); clearEnv();
    const result = await POST(new Request("http://localhost/api/lessons", { method: "POST", body: JSON.stringify(input) }));
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: "not_configured" });
  });
});

it("limits ten requests, isolates IPs and resets after an hour", () => {
  const limit = createRateLimiter();
  for (let i = 0; i < 10; i++) expect(limit("a", 0)).toBe(0);
  expect(limit("a", 0)).toBe(3600); expect(limit("b", 0)).toBe(0); expect(limit("a", 3_600_000)).toBe(0);
});
