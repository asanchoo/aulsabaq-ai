import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/lessons/route";
import { demoLesson } from "@/lib/demo";
import { GeneratedPlanSchema, LessonRequestSchema } from "@/lib/generation-schema";
import { generateLesson } from "@/lib/openai";
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
function setup() { vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_MODEL", "test-model"); }
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
    vi.stubEnv("OPENAI_API_KEY", ""); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(generateLesson(input)).rejects.toMatchObject({ code: "not_configured" }); expect(fetch).not.toHaveBeenCalled();
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
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("OPENAI_API_KEY", "");
    const result = await POST(new Request("http://localhost/api/lessons", { method: "POST", body: JSON.stringify(input) }));
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: "not_configured" });
  });
});

it("limits ten requests, isolates IPs and resets after an hour", () => {
  const limit = createRateLimiter();
  for (let i = 0; i < 10; i++) expect(limit("a", 0)).toBe(0);
  expect(limit("a", 0)).toBe(3600); expect(limit("b", 0)).toBe(0); expect(limit("a", 3_600_000)).toBe(0);
});
