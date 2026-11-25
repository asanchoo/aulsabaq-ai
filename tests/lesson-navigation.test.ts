import { expect, it } from "vitest";
import { currentLessonSection } from "@/lib/lesson-navigation";

it("does not highlight an unseen section at the top of a lesson", () => {
  expect(
    currentLessonSection([{ id: "timeline", top: 1100 }], 140, 800),
  ).toBeNull();
});
it("selects the first visible section before any heading reaches the bar", () => {
  expect(
    currentLessonSection(
      [
        { id: "timeline", top: 600 },
        { id: "explain", top: 1000 },
      ],
      140,
      800,
    ),
  ).toBe("timeline");
});
it("follows page order, including the pupil panel before the timeline", () => {
  expect(
    currentLessonSection(
      [
        { id: "students", top: -500 },
        { id: "timeline", top: 140 },
        { id: "explain", top: 700 },
      ],
      140,
      800,
    ),
  ).toBe("timeline");
});
it("keeps the last reached section active when the page is long", () => {
  expect(
    currentLessonSection(
      [
        { id: "timeline", top: -4000 },
        { id: "explain", top: -1200 },
        { id: "cards", top: -50 },
      ],
      140,
      800,
    ),
  ).toBe("cards");
});
