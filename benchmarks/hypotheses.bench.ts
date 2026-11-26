/**
 * Живой прогон по гипотезам: 21 урок, у каждого своя гипотеза о том, где продукт может ошибаться.
 * Только по явному запуску, не входит в npm test, в базу школы ничего не пишет:
 *   node --env-file=.env.local node_modules/vitest/vitest.mjs run --config benchmarks/vitest.config.mts benchmarks/hypotheses.bench.ts
 * Результаты: BENCHMARK_OUTPUT (по умолчанию /private/tmp/aulsabaq-hypotheses), один JSON на урок и summary.json.
 * BENCH_CASES="1,4,10" запускает только эти уроки.
 *
 * Код сам проверяет: проверки урока (validateLessonPlan), цели относятся к классу, ответ не стоит в подсказке,
 * у математики разные числа у 60 учеников: ответы целые и не меньше нуля в 1–4 классах, ответ не в подсказке.
 * Тему, правила языка, факты и уровень класса вычитывает человек или Claude по этим файлам.
 */
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { generateLesson } from "@/lib/ai";
import { LessonRequestSchema, type LessonRequest } from "@/lib/generation-schema";
import { hintContainsAnswer, validateLessonPlan } from "@/lib/validate";
import { resolveCurriculumGoal } from "@/lib/curriculum";
import { mathSubject, personalPlan } from "@/lib/card-variants";
import type { LessonPlan } from "@/lib/schema";

const out = process.env.BENCHMARK_OUTPUT ?? "/private/tmp/aulsabaq-hypotheses";
const only = new Set((process.env.BENCH_CASES ?? "").split(",").filter(Boolean).map(Number));

type Case = { hypothesis: string; check: string; request: LessonRequest };
const ru = "ru" as const;
const kk = "kk" as const;

const cases: Case[] = [
  // H1. Общие слова темы («строение», «система», «свойства») уводят цели и урок в чужую тему
  { hypothesis: "H1 уход темы из-за общих слов", check: "«Система органов пищеварения» не про кровь или нервы; «Строение растения» про корень, стебель, лист",
    request: { subject: "Естествознание", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "Строение растения" }, { grade: 4, topic: "Система органов пищеварения" }] } },
  { hypothesis: "H1 уход темы из-за общих слов", check: "«Табиғат зоналары» про зоны Казахстана, «Менің отбасым» про семью",
    request: { subject: "Дүниетану", language: kk, durationMin: 45, groups: [
      { grade: 2, topic: "Менің отбасым" }, { grade: 3, topic: "Қазақстанның табиғат зоналары" }] } },
  { hypothesis: "H1 уход темы из-за общих слов", check: "свойства равнобедренного треугольника и теорема Пифагора, без чужих разделов геометрии",
    request: { subject: "Геометрия", language: ru, durationMin: 45, groups: [
      { grade: 7, topic: "Свойства равнобедренного треугольника" }, { grade: 8, topic: "Теорема Пифагора" }] } },
  // H2. Правила языка: модель ошибается в ударениях, словарных словах, окончаниях, казахской грамматике
  { hypothesis: "H2 правила русского языка", check: "ь и ъ разделительные, безударные личные окончания: примеры и ответы верны, ударения верны",
    request: { subject: "Русский язык", language: ru, durationMin: 45, groups: [
      { grade: 3, topic: "Разделительный мягкий и твёрдый знак" }, { grade: 4, topic: "Безударные личные окончания глаголов" }] } },
  { hypothesis: "H2 русский язык в казахской школе (программа «с нерусским обучением»)", check: "уровень ниже, чем для русской школы; инструкции понятны ребёнку, для которого русский не родной",
    request: { subject: "Орыс тілі", language: kk, durationMin: 45, groups: [
      { grade: 2, topic: "Ударение", language: ru }, { grade: 3, topic: "Имя прилагательное", language: ru }] } },
  { hypothesis: "H2 казахская грамматика", check: "буын и тасымал верно, сын есім верно, нет смешанных алфавитов",
    request: { subject: "Қазақ тілі", language: kk, durationMin: 45, groups: [
      { grade: 3, topic: "Буын, тасымал" }, { grade: 4, topic: "Сын есім" }] } },
  { hypothesis: "H2 литература на казахском", check: "ертегі и мақал-мәтелдер: тексты не выдуманы как «народные», если они авторские; смысл пословиц верный",
    request: { subject: "Әдебиеттік оқу", language: kk, durationMin: 45, groups: [
      { grade: 2, topic: "Ертегі" }, { grade: 3, topic: "Мақал-мәтелдер" }] } },
  // H3/H11. Уровень класса и заметка учителя: учитывает ли урок «не читают», «нет телефонов», «слабый класс»
  { hypothesis: "H11 заметка «не читают, телефонов нет»", check: "1 класс: короткие задания, картинки или устно, печать; числа в составе 6; 2 класс таблица на 3",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 1, topic: "Состав числа 6", notes: "Дети пока плохо читают, телефонов нет" }, { grade: 2, topic: "Таблица умножения на 3" }] } },
  { hypothesis: "H11 заметка «слабый класс»", check: "у слабого класса больше разобранных шагов и проще первые карточки",
    request: { subject: "Математика", language: kk, durationMin: 45, groups: [
      { grade: 2, topic: "Екі таңбалы сандарды азайту", notes: "Сынып әлсіз, көпшілігі ондықтан аттап азайтуды білмейді" },
      { grade: 4, topic: "Көп таңбалы сандарды көбейту" }] } },
  // H5. Разные числа: шаблоны текстовых задач, остаток, движение, дроби
  { hypothesis: "H5 разные числа: остаток и задачи на движение", check: "у карточек с вариантами ответ решается; остаток меньше делителя; скорость, время, расстояние целые",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 3, topic: "Деление с остатком" }, { grade: 4, topic: "Задачи на движение: скорость, время, расстояние" }] } },
  { hypothesis: "H5 разные числа: задачи в два действия", check: "текстовые задачи получают шаблоны; 2 класс без отрицательных и в пределах 100",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "Задачи в два действия" }, { grade: 3, topic: "Внетабличное умножение" }] } },
  { hypothesis: "H5 разные числа: десятичные дроби и пропорции", check: "варианты не дают бесконечных дробей и деления на ноль",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 5, topic: "Сложение и вычитание десятичных дробей" }, { grade: 6, topic: "Пропорции" }] } },
  // H6. Разные языки обучения в одном кабинете
  { hypothesis: "H6 класс на казахском и класс на русском в одном уроке", check: "карточки 2 класса на казахском, 4 класса на русском; цели на нужных языках",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "Ондықтан аттап қосу", language: kk }, { grade: 4, topic: "Деление на двузначное число" }] } },
  // H7. Число классов и длительность
  { hypothesis: "H7 четыре класса сразу", check: "у каждого класса есть время с учителем и хватает карточек; учитель никогда не с двумя классами",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 1, topic: "Сложение в пределах 20" }, { grade: 2, topic: "Нумерация чисел до 100" },
      { grade: 3, topic: "Таблица умножения на 6" }, { grade: 4, topic: "Деление многозначных чисел" }] } },
  { hypothesis: "H7 один класс", check: "урок на один класс без лишних «совмещённых» этапов",
    request: { subject: "Русский язык", language: ru, durationMin: 45, groups: [{ grade: 4, topic: "Наречие" }] } },
  { hypothesis: "H7 короткий урок 30 минут на три класса", check: "расписание укладывается в 30 минут, карточек меньше, но хватает",
    request: { subject: "Познание мира", language: ru, durationMin: 30, groups: [
      { grade: 1, topic: "Правила дорожного движения" }, { grade: 2, topic: "Времена года" }, { grade: 4, topic: "Природные зоны Казахстана" }] } },
  // H9. Странные темы: не из программы, короткие, с опечатками
  { hypothesis: "H9 тема не из программы и слишком короткая тема", check: "«Астронавигация» во 2 классе: урок по возрасту и без выдуманных целей; «Дроби» в 3 классе: доли, без сложения дробей",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "Астронавигация" }, { grade: 3, topic: "Дроби" }] } },
  { hypothesis: "H9 опечатки в теме", check: "модель понимает тему с опечатками и не повторяет их в уроке",
    request: { subject: "Русский язык", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "безударнае гласныи в корне" }, { grade: 4, topic: "чисти речи" }] } },
  // H10. Четверть
  { hypothesis: "H10 выбранная четверть ограничивает цели", check: "цели только из этой четверти плана; темы не забегают вперёд",
    request: { subject: "Математика", language: ru, durationMin: 45, groups: [
      { grade: 2, topic: "Умножение и деление", quarter: 3 }, { grade: 4, topic: "Умножение и деление на двузначное число", quarter: 2 }] } },
  // H14. Факты: история и предмет без подключённой программы
  { hypothesis: "H14 факты истории, программа не подключена", check: "даты и имена верны; целей нет, и урок не заявляет соответствие программе",
    request: { subject: "История Казахстана", language: ru, durationMin: 45, groups: [
      { grade: 5, topic: "Древние люди на территории Казахстана" }, { grade: 6, topic: "Казахское ханство" }] } },
  // H12. Тема, которую раньше уводило: квадратичная функция теперь в своём 8 классе
  { hypothesis: "H12 тема в своём классе по программе", check: "8 класс получает цели про квадратичную функцию; прогрессия 9 класса без чужих целей",
    request: { subject: "Алгебра", language: ru, durationMin: 45, groups: [
      { grade: 8, topic: "Квадратичная функция" }, { grade: 9, topic: "Арифметическая прогрессия" }] } },
  // H15. Классы в разных кабинетах (выбор в форме с 26 ноября): нет общего начала и итога
  { hypothesis: "H15 классы в разных кабинетах", check: "нет общего этапа; тексты этапов не говорят «все вместе», итог урока у каждого класса на его проверке",
    request: { subject: "Математика", language: ru, durationMin: 45, rooms: "separate", groups: [
      { grade: 2, topic: "Сложение двузначных чисел с переходом через десяток" }, { grade: 4, topic: "Деление на однозначное число" }] } },
  { hypothesis: "H15 классы в разных кабинетах", check: "три класса на казахском: нет общего этапа и слов «бәрі бірге», «барлық сынып бірге»",
    request: { subject: "Математика", language: kk, durationMin: 45, rooms: "separate", groups: [
      { grade: 1, topic: "10 көлеміндегі сандарды қосу" }, { grade: 2, topic: "Ондықтан аттап қосу" }, { grade: 4, topic: "Көп таңбалы санды бір таңбалы санға көбейту" }] } },
];

/** Автоматические проверки, которые не требуют чтения урока. */
function autoChecks(plan: LessonPlan, request: LessonRequest) {
  const groups = plan.groups.map((g) => {
    const lang = request.groups.find((r) => r.grade === g.grade)?.language ?? request.language;
    const foreignGoals = (g.curriculumGoals ?? []).filter((goal) => !resolveCurriculumGoal(goal, g.grade, lang)).map((goal) => goal.code);
    // Та же проверка, что INV-8 в уроке (по словам и числам, а не по подстроке: «36» внутри «360» не утечка)
    const hintLeaks = g.cards.filter((c) => c.answer && c.hint && hintContainsAnswer(c.hint, c.answer))
      .map((c) => c.id);
    return { grade: g.grade, cards: g.cards.length, extra: g.extraCards?.length ?? 0, goals: (g.curriculumGoals ?? []).map((x) => x.code), foreignGoals, hintLeaks };
  });
  let variants: unknown = null;
  if (mathSubject(plan.subject)) {
    const seeds = Array.from({ length: 60 }, (_, i) => `bench-${i}`);
    const personal = seeds.map((s) => personalPlan(plan, s));
    variants = plan.groups.map((g, gi) => {
      const perCard = g.cards.map((card, ci) => {
        const prompts = new Set(personal.map((p) => p.groups[gi].cards[ci].prompt));
        const answers = personal.map((p) => p.groups[gi].cards[ci].answer).filter((a): a is string => !!a);
        const numeric = answers.map((a) => a.replace(",", ".").match(/^-?\d+(\.\d+)?$/) ? Number(a.replace(",", ".")) : null).filter((n): n is number => n !== null);
        const bad = g.grade <= 4 ? numeric.filter((n) => n < 0 || !Number.isInteger(n)).length : 0;
        const leaks = personal.filter((p) => { const c = p.groups[gi].cards[ci]; return c.answer && c.hint && hintContainsAnswer(c.hint, c.answer); }).length;
        return { id: card.id, distinct: prompts.size, badAnswers: bad, hintLeaks: leaks };
      });
      return { grade: g.grade, cardsWithVariants: perCard.filter((c) => c.distinct > 1).length, cards: perCard.length, problems: perCard.filter((c) => c.badAnswers || c.hintLeaks) };
    });
  }
  // H15: в разных кабинетах нет общего этапа, и тексты этапов не зовут классы вместе
  const together = /все классы|вместе|общ(ий|ее|ая) (настрой|итог|начало|рефлекс)|барлық сынып|бәрі бірге|бірге/iu;
  const rooms = plan.rooms === "separate"
    ? { joint: plan.timeline.filter((s) => s.mode === "joint").length, togetherTexts: plan.timeline.filter((s) => together.test(s.activity)).map((s) => `${s.groupId} ${s.startMin}–${s.endMin}: ${s.activity}`) }
    : null;
  return { groups, variants, rooms };
}

describe.concurrent("гипотезы", () => {
  for (const [n, item] of cases.entries()) {
    if (only.size && !only.has(n + 1)) continue;
    it(`${n + 1}. ${item.hypothesis}: ${item.request.subject}`, async () => {
      const input = LessonRequestSchema.parse(item.request);
      const started = Date.now();
      const record: Record<string, unknown> = { n: n + 1, hypothesis: item.hypothesis, check: item.check, input };
      try {
        const plan = await generateLesson(input);
        record.ms = Date.now() - started;
        record.issues = validateLessonPlan(plan);
        record.auto = autoChecks(plan, input);
        record.plan = plan;
      } catch (error) {
        record.ms = Date.now() - started;
        record.error = error instanceof Error ? error.message : String(error);
      }
      await mkdir(out, { recursive: true });
      await writeFile(`${out}/${n + 1}.json`, JSON.stringify(record, null, 2));
      expect(record).toBeTruthy();
    });
  }
});
