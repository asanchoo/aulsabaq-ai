import { afterEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  getLessonRun: vi.fn(),
  setLessonRun: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  ...store,
  isUuid: (s: string) => /^[a-f0-9-]{36}$/.test(s),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkLimit: async () => 0,
  clientIp: () => "test",
  limited: () => new Response(null, { status: 429 }),
}));
import { GET, POST } from "@/app/api/lessons/[id]/run/route";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ctx = { params: Promise.resolve({ id }) };
const request = (body: unknown, token = "a".repeat(48)) =>
  new Request("http://localhost/api/lessons/" + id + "/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-teacher-token": token },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("stays disabled until migration is enabled", async () => {
  vi.stubEnv("RUN_SYNC", "off");
  expect((await POST(request({}), ctx)).status).toBe(503);
  expect(
    await (await GET(new Request("http://localhost"), ctx)).json(),
  ).toEqual({ supported: false, run: null });
  expect(store.setLessonRun).not.toHaveBeenCalled();
});
it("rejects missing token and inconsistent timestamps", async () => {
  vi.stubEnv("RUN_SYNC", "on");
  expect(
    (await POST(request({ startedAt: 100, pausedAt: null }, ""), ctx)).status,
  ).toBe(403);
  expect(
    (await POST(request({ startedAt: 100, pausedAt: 50 }), ctx)).status,
  ).toBe(400);
  expect(store.setLessonRun).not.toHaveBeenCalled();
});
it("rejects a wrong teacher key through the database result", async () => {
  vi.stubEnv("RUN_SYNC", "on");
  store.setLessonRun.mockResolvedValue(false);
  expect(
    (await POST(request({ startedAt: 100, pausedAt: null }), ctx)).status,
  ).toBe(403);
});
it("persists start and stop with the teacher token", async () => {
  vi.stubEnv("RUN_SYNC", "on");
  store.setLessonRun.mockResolvedValue(true);
  expect(
    (await POST(request({ startedAt: 100, pausedAt: null }), ctx)).status,
  ).toBe(200);
  expect(store.setLessonRun).toHaveBeenLastCalledWith(id, "a".repeat(48), {
    startedAt: 100,
    pausedAt: null,
  });
  expect(
    (await POST(request({ startedAt: null, pausedAt: null }), ctx)).status,
  ).toBe(200);
  expect(store.setLessonRun).toHaveBeenLastCalledWith(id, "a".repeat(48), null);
});
