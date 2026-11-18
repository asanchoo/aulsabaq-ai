import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lessons/route";
import { demoLesson } from "@/lib/demo";
import { GeneratedContentSchema, LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson } from "@/lib/ai";
import { resolveProvider, retryTiming, toGeminiSchema, toOpenAISchema } from "@/lib/providers";
import { createRateLimiter } from "@/lib/rate-limit";
import { ExplanationSchema, type LessonPlan } from "@/lib/schema";
import { planSchedule } from "@/lib/schedule";
import { validateLessonPlan } from "@/lib/validate";
import { toDraft } from "@/lib/visuals";
import { z } from "zod";

const input = {
  subject: demoLesson.subject, language: demoLesson.language, durationMin: demoLesson.durationMin,
  groups: demoLesson.groups.map((g) => ({ grade: g.grade, topic: g.topic })),
};
const schedule = planSchedule(input.groups.length, input.durationMin);
/** Карточки повторения пишет запрос объяснения: берём карточки повторения демо-урока (их хватает на 12 минут). */
const reviewOf = (grade: unknown) => {
  const group = demoLesson.groups.find((g) => g.grade === grade)!;
  const i = demoLesson.groups.indexOf(group);
  if (schedule.cards[i].reviewMinutes === 0) return [];
  return group.cards.filter((c) => c.purpose === "review").map((card) => {
    const c: Partial<typeof card> = { ...card };
    delete c.id;
    delete c.purpose;
    return { ...c, answer: card.answer ?? null, minutes: card.minutes ?? 3 };
  });
};
/** Сколько карточек: повторение из объяснения, практика по темпу (3 минуты на карточку в начальной школе) и одна в запас. */
const cardCounts = schedule.cards.map((c, i) => ({
  review: reviewOf(demoLesson.groups[i].grade).length,
  practice: Math.max(3, Math.ceil(c.practiceMinutes / 3) + 1),
}));
/** Ответ модели на запрос содержания: только практика, карточки демо-урока по кругу, по 3 минуты. */
function generated() {
  return {
    subject: demoLesson.subject, language: demoLesson.language, durationMin: demoLesson.durationMin,
    opening: "Общий настрой", closing: "Общий итог",
    groups: demoLesson.groups.map((g, i) => ({
      grade: g.grade, topic: g.topic, learningGoal: g.learningGoal, homework: g.homework,
      cards: Array.from({ length: cardCounts[i].practice }, (_, k) => {
        const practice = g.cards.filter((c) => c.purpose === "practice");
        const card = practice[k % practice.length];
        const c: Partial<typeof card> = { ...card };
        delete c.id;
        delete c.purpose;
        return { ...c, answer: card.answer ?? null, minutes: 3 };
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
  expect(plan.groups.map((g) => g.cards.map((c) => c.id))).toEqual(cardCounts.map((c, i) =>
    Array.from({ length: c.review + c.practice }, (_, k) => `g${i + 1}-c${k + 1}`)));
  // Пока второй класс ждёт учителя, он решает свои карточки повторения.
  expect(plan.timeline.find((s) => s.groupId === "g2" && s.mode === "independent")?.cardIds).toEqual(
    Array.from({ length: cardCounts[1].review }, (_, k) => `g2-c${k + 1}`));
}
/** Ответ модели на запрос объяснения: объяснение демо-урока в формате модели (наглядные блоки черновиками). */
function draftOf(grade: unknown) {
  const e = demoLesson.groups.find((g) => g.grade === grade)!.explanation;
  const example = (x: typeof e.example) => ({ ...x, visual: x.visual ? toDraft(x.visual) : null });
  return { ...e, visuals: e.visuals.map(toDraft), example: example(e.example), examples: e.examples.map(example), reviewCards: reviewOf(grade) };
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

/** Что спросили у модели: содержание (в запросе есть request), корректуру (texts) или объяснение одного класса. */
function requestOf(init: RequestInit): { kind: "plan" | "explain" | "proof"; data: Record<string, unknown> } {
  const body = JSON.parse(String(init.body));
  const input = typeof body.input === "string" ? body.input : Array.isArray(body.input) ? body.input[0].content[0].text : body.contents[0].parts[0].text;
  const data = JSON.parse(input);
  return { kind: "request" in data ? "plan" : "texts" in data ? "proof" : "explain", data };
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
    if (kind === "explain") return format(draftOf(data.grade));
    if (kind === "proof") return format({ corrections: [] });
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
    expect(fetch).toHaveBeenCalledTimes(1 + input.groups.length + 1); // объяснения, содержание, корректура
    const body = JSON.parse(planCalls(fetch)[0][1].body);
    expect(body.model).toBe("test-model"); expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
  });
  it("asks for content after the explanations and passes their worked examples", async () => {
    setup();
    const fetch = fakeModel(provider); vi.stubGlobal("fetch", fetch);
    await generateLesson(input);
    const kinds = fetch.mock.calls.map(([, init]) => requestOf(init as RequestInit).kind);
    expect(kinds).toEqual(["explain", "explain", "plan", "proof"]);
    const request = requestOf(planCalls(fetch)[0][1] as RequestInit).data as { explanations: Record<string, unknown>[] };
    // Содержание строится на объяснении: ситуация, лестница примеров, ошибки, итог, готовые карточки повторения.
    expect(request.explanations[1]).toMatchObject({
      group: 2,
      hook: demoLesson.groups[1].explanation.hook,
      examples: [demoLesson.groups[1].explanation.example, ...demoLesson.groups[1].explanation.examples].map((x) => ({ level: x.level, problem: x.problem, answer: x.answer })),
      mistakes: demoLesson.groups[1].explanation.mistakes,
      summary: demoLesson.groups[1].explanation.summary,
      reviewCards: demoLesson.groups[1].cards.filter((c) => c.purpose === "review").map((c) => c.prompt),
    });
    expect(request.explanations[0]).toMatchObject({ reviewCards: [] }); // у первого класса повторения нет
  });
  it("sends validation errors on a repair attempt", async () => {
    setup(); const broken = generated(); broken.groups[0].cards.splice(-2); // карточек не хватит на всё время практики (TIME)
    const fetch = fakeModel(provider, [broken, generated()]); vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    const calls = planCalls(fetch);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(JSON.parse(calls[1][1].body).input).validationErrors.length).toBeGreaterThan(0);
  });
  it("after all repairs, accepts a lesson whose only issue is a few cards short, and never one with a hard error", async () => {
    setup();
    const short = generated(); short.groups[0].cards.splice(-2); // мягко: не хватает карточек по времени
    let fetch = fakeModel(provider, [short]); vi.stubGlobal("fetch", fetch);
    const plan = await generateLesson(input);
    expect(planCalls(fetch)).toHaveLength(3);
    expect(plan.groups[0].cards).toHaveLength(cardCounts[0].review + cardCounts[0].practice - 2);
    const check = validateLessonPlan(plan);
    expect(!check.ok && check.errors.every((e) => e.startsWith("TIME"))).toBe(true);

    const wrong = generated(); wrong.groups[0].cards.splice(-2); wrong.groups[0].cards[0].answer = "1"; // и неверный ответ
    fetch = fakeModel(provider, [wrong]); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toThrow("invalid_plan");
  });
  it("repairs an explanation with a wrong calculation", async () => {
    setup();
    const wrong = structuredClone(draftOf(2));
    wrong.example.steps[0] = "Единицы: 6 + 8 = 15.";
    let explainCalls = 0;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { kind, data } = requestOf(init);
      if (kind === "plan") return provider(generated());
      if (data.grade === 2 && explainCalls++ === 0) return provider(wrong);
      return provider(draftOf(data.grade));
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
  it("sends textbook photos as images to the right class and keeps them out of the JSON text", async () => {
    setupGemini();
    const photo = { mimeType: "image/jpeg" as const, data: "A".repeat(200) };
    const withPhotos = { ...input, groups: [{ ...input.groups[0], pages: "34–35", photos: [photo] }, input.groups[1]] };
    const fetch = fakeModel(gemini); vi.stubGlobal("fetch", fetch);
    const plan = await generateLesson(withPhotos);
    expect(plan.groups[0].source).toEqual({ pages: "34–35", photos: 1 });
    expect(plan.groups[1].source).toBeNull();
    const parts = (init: unknown) => JSON.parse(String((init as RequestInit).body)).contents[0].parts as { text?: string; inlineData?: unknown }[];
    const explain = fetch.mock.calls.filter(([, init]) => requestOf(init as RequestInit).kind === "explain");
    const images = explain.map(([, init]) => parts(init).filter((p) => p.inlineData).length);
    expect(images.sort()).toEqual([0, 1]); // фото уходит только в объяснение того класса, к которому приложено
    const planParts = parts(planCalls(fetch)[0][1]);
    expect(planParts.filter((p) => p.inlineData)).toHaveLength(1);
    expect(planParts[0].text).not.toContain("AAAA");
    expect(JSON.parse(planParts[0].text!).request.groups[0]).toMatchObject({ pages: "34–35", textbookPhotos: 1 });
  });

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
    expect(toOpenAISchema({ $schema: "x", type: "string", minLength: 1, maxLength: 9 })).toEqual({ type: "string" });
    // Ограничения длины Gemini не принимает на большой вложенной схеме («too many states»): их проверяет Zod.
    expect(toGeminiSchema({ type: "array", minItems: 2, maxItems: 6, items: { type: "string", minLength: 1 } })).toEqual({ type: "array", items: { type: "string" } });
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
      return gemini(kind === "plan" ? generated() : draftOf(data.grade));
    });
    vi.stubGlobal("fetch", fetch);
    expectLesson(await generateLesson(input));
    const spare = fetch.mock.calls.filter(([url]) => url.includes("gemini-2.5-spare"));
    expect(spare).toHaveLength(1 + input.groups.length + 1);
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

describe("billing", () => {
  it("does not retry when the account has no credits", async () => {
    clearEnv(); vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_MODEL", "test-model");
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), { status: 429 })));
    vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
    expect(fetch).toHaveBeenCalledTimes(input.groups.length); // по одному запросу на объяснение, без повторов
  });
});
