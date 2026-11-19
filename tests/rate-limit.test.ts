import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDailyCap, dailyCap, DAILY_CAPS } from "@/lib/rate-limit";

afterEach(() => vi.unstubAllEnvs());

describe("общий суточный предел на платную модель", () => {
  it("работает, даже когда лимиты по IP выключены", async () => {
    vi.stubEnv("RATE_LIMITS", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_KEY", "");
    let blocked = 0;
    for (let i = 0; i <= DAILY_CAPS.lesson; i++) blocked = await checkDailyCap("lesson");
    expect(blocked).toBeGreaterThan(0);
  });

  it("значение можно поменять в env, мусор в env не ломает предел", () => {
    expect(dailyCap("lesson", { DAILY_LESSON_CAP: "40" })).toBe(40);
    expect(dailyCap("lesson", { DAILY_LESSON_CAP: "abc" })).toBe(DAILY_CAPS.lesson);
    expect(dailyCap("hint", {})).toBe(DAILY_CAPS.hint);
  });
});
