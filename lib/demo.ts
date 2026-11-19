import demoRu from "@/fixtures/demo-lesson.ru.json";
import demoKk from "@/fixtures/demo-lesson.kk.json";
import type { Locale } from "./i18n";
import type { LessonPlan } from "./schema";
import { parseLessonPlan } from "./validate";

/**
 * Демо-урок на каждом языке сайта: те же темы (2 и 4 класс), казахский собран тем же конвейером и вычитан.
 * Оба проходят те же проверки, что и ответ модели: если фикстуру сломают, сборка упадёт сразу, а не у рецензента.
 */
function loadDemo(fixture: unknown, lang: Locale): LessonPlan {
  const result = parseLessonPlan(fixture);
  if (!result.ok) throw new Error(`Демо-урок (${lang}) невалиден:\n${result.errors.join("\n")}`);
  if (result.plan.language !== lang) throw new Error(`Демо-урок (${lang}) написан на языке ${result.plan.language}`);
  return result.plan;
}

const DEMOS: Record<Locale, LessonPlan> = { ru: loadDemo(demoRu, "ru"), kk: loadDemo(demoKk, "kk") };

/** Русский демо-урок: на нём держатся тесты. */
export const demoLesson: LessonPlan = DEMOS.ru;
/** Демо-урок на языке интерфейса: лендинг, страница демо, копия с кодом для учеников. */
export const demoFor = (lang: Locale): LessonPlan => DEMOS[lang];
export const DEMO_LESSON_ID = "demo";
