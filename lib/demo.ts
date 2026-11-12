import demoFixture from "@/fixtures/demo-lesson.ru.json";
import type { LessonPlan } from "./schema";
import { parseLessonPlan } from "./validate";

/**
 * Демо-урок проходит те же проверки, что и ответ модели.
 * Если фикстуру сломают, сборка упадёт сразу, а не у рецензента.
 */
function loadDemo(): LessonPlan {
  const result = parseLessonPlan(demoFixture);
  if (!result.ok) throw new Error(`Демо-урок невалиден:\n${result.errors.join("\n")}`);
  return result.plan;
}

export const demoLesson: LessonPlan = loadDemo();
export const DEMO_LESSON_ID = "demo";
