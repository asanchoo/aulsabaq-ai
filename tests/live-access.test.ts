import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../app/api/lessons/[id]/teacher/route";
import { getLesson, isTeacher } from "../lib/store";
import { demoFor } from "../lib/demo";
vi.mock("../lib/store", () => ({ isTeacher: vi.fn(), getLesson: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const context = { params: Promise.resolve({ id: "lesson" }) };
it("пульт не загружает данные урока без правильного ключа", async () => {
  vi.mocked(isTeacher).mockResolvedValue(false);
  expect(
    (await GET(new Request("http://local/api/lessons/lesson/teacher"), context))
      .status,
  ).toBe(403);
  expect(getLesson).not.toHaveBeenCalled();
});
it("пульт возвращает урок учителю и не возвращает его ключ", async () => {
  vi.mocked(isTeacher).mockResolvedValue(true);
  vi.mocked(getLesson).mockResolvedValue({
    id: "lesson",
    joinCode: "123456",
    plan: demoFor("ru"),
    isDemo: true,
    updatedAt: new Date(0).toISOString(),
  });
  const response = await GET(
    new Request("http://local/api/lessons/lesson/teacher", {
      headers: { "x-teacher-token": "local-key" },
    }),
    context,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.plan.groups).toHaveLength(2);
  expect(body.isDemo).toBe(true);
  expect(JSON.stringify(body)).not.toContain("local-key");
});
