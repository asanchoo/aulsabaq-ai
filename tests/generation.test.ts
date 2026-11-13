import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lessons/route";
import { demoLesson } from "@/lib/demo";
import { GeneratedPlanSchema, LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson } from "@/lib/ai";
import { resolveProvider, toGeminiSchema } from "@/lib/providers";
import { createRateLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const input = {
  subject: demoLesson.subject, language: demoLesson.language, durationMin: demoLesson.durationMin,
  groups: demoLesson.groups.map((g) => ({ grade: g.grade, topic: g.topic })),
};
function generated() {
  return { ...structuredClone(demoLesson),
    groups: demoLesson.groups.map((g) => ({ ...g, cards: g.cards.map((c) => ({ ...c, answer: c.answer ?? null })) })),
    timeline: demoLesson.timeline.map((s) => ({ ...s, cardIds: s.cardIds ?? null })),
  };
}
function provider(plan: unknown, status = "completed") {
  return Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(plan) }] }] });
}
function clearEnv() { for (const k of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"]) vi.stubEnv(k, ""); }
function setup() { clearEnv(); vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_MODEL", "test-model"); }
function setupGemini() { clearEnv(); vi.stubEnv("GEMINI_API_KEY", "gemini-key"); vi.stubEnv("GEMINI_MODEL", "gemini-test"); }
function gemini(plan: unknown, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { role: "model", parts: [{ text: JSON.stringify(plan) }] } }] });
}
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
    check(z.toJSONSchema(GeneratedPlanSchema, { target: "draft-7" }));
  });
});

describe("generation", () => {
  it("validates the response and uses the configured model without storing it", async () => {
    setup();
    const fetch = vi.fn().mockResolvedValueOnce(provider(generated())); vi.stubGlobal("fetch", fetch);
    const plan = await generateLesson(input);
    expect(plan).toEqual(demoLesson);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe("test-model"); expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
  });
  it("sends validation errors on one repair attempt", async () => {
    setup(); const broken = generated(); broken.timeline[0].endMin = 1;
    const fetch = vi.fn().mockResolvedValueOnce(provider(broken)).mockResolvedValueOnce(provider(generated())); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).resolves.toEqual(demoLesson);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).input).validationErrors.length).toBeGreaterThan(0);
  });
  it("rejects a valid lesson that ignores the requested topic", async () => {
    setup(); const fetch = vi.fn().mockImplementation(() => Promise.resolve(provider(generated()))); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson({ ...input, groups: input.groups.map((g) => ({ ...g, topic: "Другая тема" })) })).rejects.toMatchObject({ code: "invalid_plan" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("handles refusal without exposing provider content", async () => {
    setup(); const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }))); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "invalid_plan" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("stops on provider/network errors", async () => {
    setup(); const fetch = vi.fn().mockRejectedValue(new Error("network")); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
    expect(fetch).toHaveBeenCalledTimes(1);
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
    const fetch = vi.fn().mockResolvedValueOnce(gemini(generated())); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).resolves.toEqual(demoLesson);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("gemini-key");
    const schema = JSON.stringify(JSON.parse(init.body).generationConfig.responseJsonSchema);
    expect(schema).not.toContain("$schema"); expect(schema).not.toContain('"const"');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe("application/json");
    expect(JSON.parse(init.body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });
  it("turns const into a one-value enum", () => {
    expect(toGeminiSchema({ $schema: "x", anyOf: [{ type: "number", const: 1 }] })).toEqual({ anyOf: [{ type: "number", enum: [1] }] });
  });
  it("repairs once after a cut-off answer and skips thought parts", async () => {
    setupGemini();
    const thought = Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "думаю…", thought: true }, { text: JSON.stringify(generated()) }] } }] });
    const fetch = vi.fn().mockResolvedValueOnce(gemini(generated(), "MAX_TOKENS")).mockResolvedValueOnce(thought); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).resolves.toEqual(demoLesson);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reports a blocked prompt as an invalid plan and an HTTP error as a provider error", async () => {
    setupGemini();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ promptFeedback: { blockReason: "SAFETY" } }))));
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "invalid_plan" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "provider" });
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
