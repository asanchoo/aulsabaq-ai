import { expect, it } from "vitest";
import { demoFor } from "../lib/demo";
import { classRoute } from "../lib/route-sheet";

it("бумажный маршрут сохраняет интервалы и номера карточек своего класса", () => {
  const plan = demoFor("ru");
  const route = classRoute(plan, "g1");
  expect(route[0]).toEqual({ start: 0, end: 5, mode: "joint", cards: [] });
  expect(route.find((s) => s.start === 15)?.cards).toEqual([
    1, 2, 3, 4, 5, 6, 7,
  ]);
  expect(route.at(-1)?.end).toBe(45);
  expect(classRoute(plan, "g2").find((s) => s.start === 5)?.cards).toEqual([
    1, 2, 3, 4, 5, 6,
  ]);
  expect(classRoute(plan, "missing")).toEqual([]);
});
