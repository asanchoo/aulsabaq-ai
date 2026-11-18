import { findMixedScriptWord, findWrongEquation } from "./arithmetic";
import { GeneratedExplanationSchema, type GeneratedExplanation } from "./generation-schema";
import { columnResult, toVisual, visualTexts, type Visual, type VisualDraft } from "./visuals";
import { ExplanationSchema, LessonPlanSchema, type Explanation, type LessonCore, type LessonPlan, type Segment, type TaskCard } from "./schema";

/**
 * validateLessonPlan — проверка СМЫСЛА урока (SPEC §5, инварианты 1–9).
 *
 * Zod уже гарантировал, что поля на месте и нужного типа. Но модель может вернуть
 * аккуратный JSON, по которому урок физически невозможно провести: учитель в одну
 * минуту с двумя классами, дыра в таймлайне, самостоятельная работа без карточек.
 * Эта функция ловит такие планы. Она чистая (без сети и БД), поэтому легко тестируется.
 *
 * Каждая ошибка начинается с кода (INV-1 … INV-9, EXP, REF), чтобы тесты и повторный
 * запрос к модели могли понять, что именно не так.
 */

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export const LIMITS = {
  groups: { min: 2, max: 3 },
  cards: { min: 3, max: 16 },
  durationMin: { min: 30, max: 90 },
} as const;

/**
 * Принимает и полный урок, и урок без объяснений (LessonCore): модель составляет их
 * разными запросами, а правила таймлайна и карточек от объяснений не зависят.
 */
export function validateLessonPlan(plan: LessonCore): ValidationResult {
  const errors: string[] = [];
  const byGroup = groupSegments(plan, errors);

  checkLimits(plan, errors);
  checkUniqueIds(plan, errors);
  checkCoverage(plan, byGroup, errors);
  checkTeacherLoad(plan, errors);
  checkModesPresent(plan, byGroup, errors);
  checkCards(plan, byGroup, errors);
  checkCardOrder(plan, byGroup, errors);
  checkHints(plan, errors);
  checkPlanArithmetic(plan, errors);
  checkTiming(plan, byGroup, errors);
  for (const group of plan.groups) {
    if ("explanation" in group) errors.push(...checkExplanation((group as LessonPlan["groups"][number]).explanation, group.id));
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

type Parsed<T> = { ok: true; plan: T } | { ok: false; errors: string[] };

function schemaErrors(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => `SCHEMA: ${issue.path.map(String).join(".") || "(корень)"}: ${issue.message}`);
}

/** Zod + validateLessonPlan за один вызов: для готового урока и загрузки фикстур. */
export function parseLessonPlan(input: unknown): Parsed<LessonPlan> {
  const parsed = LessonPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error.issues) };
  const result = validateLessonPlan(parsed.data);
  return result.ok ? { ok: true, plan: parsed.data } : result;
}

/**
 * Ответ модели на запрос объяснения одного класса: форма, наглядные блоки и арифметика.
 * Неверный наглядный блок (например, график, формулу которого нельзя разобрать) выбрасываем, а не просим
 * переписать всё объяснение: повтор стоит учителю ещё полминуты ожидания. Но если не осталось ни одного блока,
 * просим модель исправить: наглядность — главное в объяснении.
 */
export function parseExplanation(input: unknown): Parsed<Explanation> {
  const parsed = GeneratedExplanationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error.issues) };
  const g = parsed.data;
  const rejected: string[] = [];
  const convert = (draft: VisualDraft | null) => {
    if (!draft) return null;
    const result = toVisual(draft);
    if (result.ok) return result.visual;
    rejected.push(result.error);
    return null;
  };
  const example = (e: GeneratedExplanation["example"]) => ({ problem: e.problem, steps: e.steps, answer: e.answer, visual: convert(e.visual), level: e.level });
  const explanation = ExplanationSchema.parse({
    hook: g.hook,
    intuition: g.intuition,
    terms: g.terms,
    summary: g.summary,
    keyIdea: g.keyIdea,
    steps: g.steps,
    visuals: g.visuals.map(convert).filter((v): v is NonNullable<typeof v> => v !== null),
    example: example(g.example),
    examples: g.examples.map(example),
    practice: g.practice,
    mistakes: g.mistakes,
    checkQuestions: g.checkQuestions,
  });
  if (rejected.length) console.warn(`[ai] dropped visuals: ${rejected.map((r) => r.split(":").slice(0, 2).join(":")).join(", ")}`);
  const visualCount = explanation.visuals.length + [explanation.example, ...explanation.examples].filter((e) => e.visual).length;
  const errors = checkExplanation(explanation);
  if (visualCount === 0) errors.push(`VIS: no valid visual block; add at least one (${rejected.join("; ") || "visuals is empty"})`);
  return errors.length ? { ok: false, errors } : { ok: true, plan: explanation };
}

/**
 * Объяснение темы: каждое числовое равенство в нём верно (EXP), кроме раздела ошибок.
 * Учитель читает разбор примера классу, ошибка в счёте здесь хуже, чем в карточке.
 */
export function checkExplanation(e: Explanation, groupId?: string): string[] {
  const where = groupId ? ` у группы ${groupId}` : "";
  const examples = [e.example, ...e.examples];
  // mistakes не проверяем: там намеренно приводят неверный ответ ученика («63 − 28 = 45»).
  const texts = [
    e.hook, e.intuition, e.keyIdea, ...e.steps, ...e.summary, ...e.terms.flatMap((x) => [x.term, x.meaning]),
    ...examples.flatMap((x) => [x.problem, ...x.steps, x.answer]),
    ...e.practice.flatMap((p) => [p.task, p.answer]),
    ...e.checkQuestions,
    ...[...e.visuals, ...examples.map((x) => x.visual)].flatMap((v) => (v ? visualTexts(v) : [])),
  ];
  const errors: string[] = [];
  for (const text of texts) {
    const wrong = findWrongEquation(text);
    if (wrong) errors.push(`EXP: в объяснении${where} неверное равенство «${wrong}»; пересчитай пример`);
  }
  // Пример «36 + 48» с ответом «74» или «Попробуй сам: 45 + 27» с неверным ответом: пересчитываем.
  for (const [task, answer] of [...examples.map((x) => [x.problem, x.answer]), ...e.practice.map((p) => [p.task, p.answer])]) {
    const wrong = wrongExpressionAnswer(task, answer);
    if (wrong) errors.push(`EXP: в объяснении${where} неверный ответ: ${wrong}; пересчитай`);
  }
  // Примеры-клоны: та же ступень и один получается из другого заменой чисел той же длины («36 + 48» и «57 + 25»).
  // Такие примеры не добавляют понимания. Пример с подвохом может отличаться только числами (618 : 6 с нулём
  // в частном после 756 : 3), поэтому клоном считаем только пример той же ступени.
  const shape = (x: (typeof examples)[number]) => `${x.level ?? ""}|${x.problem.toLowerCase().replace(/\d/g, "#").replace(/\s+/g, " ").trim()}`;
  examples.forEach((x, i) => {
    const twin = examples.findIndex((y, j) => j < i && shape(y) === shape(x));
    if (twin !== -1) errors.push(`EXP: в объяснении${where} примеры «${examples[twin].problem}» и «${x.problem}» отличаются только числами; замени второй примером другого типа`);
  });
  // Наглядный блок к примеру посчитан кодом: ответ примера должен с ним совпасть.
  for (const x of examples) {
    const computed = x.visual ? visualResult(x.visual) : null;
    if (computed !== null && !x.answer.replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, "$1").match(new RegExp(`(?<!\\d)${computed}(?!\\d)`))) {
      errors.push(`EXP: в объяснении${where} ответ примера «${x.problem}» (${x.answer}) не совпадает с вычислением ${computed}; проверь пример и блок`);
    }
  }
  for (const text of [...texts, ...e.mistakes]) {
    const word = findMixedScriptWord(text);
    if (word) errors.push(`TXT: в объяснении${where} опечатка «${word}»: в слове смешаны алфавиты`);
  }
  return errors;
}

// ---------------------------------------------------------------------------

/** Раскладывает отрезки по группам; отрезки с несуществующей группой — ошибка REF. */
function groupSegments(plan: LessonCore, errors: string[]): Map<string, Segment[]> {
  const byGroup = new Map<string, Segment[]>(plan.groups.map((g) => [g.id, []]));
  for (const seg of plan.timeline) {
    const list = byGroup.get(seg.groupId);
    if (list) list.push(seg);
    else errors.push(`REF: отрезок ${range(seg)} ссылается на несуществующую группу «${seg.groupId}»`);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.startMin - b.startMin);
  return byGroup;
}

/** Инвариант 6: границы количества групп, карточек и длительности. */
function checkLimits(plan: LessonCore, errors: string[]) {
  const { groups, cards, durationMin } = LIMITS;
  if (plan.groups.length < groups.min || plan.groups.length > groups.max) {
    errors.push(`INV-6: групп ${plan.groups.length}, нужно от ${groups.min} до ${groups.max}`);
  }
  for (const g of plan.groups) {
    if (g.cards.length < cards.min || g.cards.length > cards.max) {
      errors.push(`INV-6: у группы ${g.id} карточек ${g.cards.length}, нужно от ${cards.min} до ${cards.max}`);
    }
  }
  if (plan.durationMin < durationMin.min || plan.durationMin > durationMin.max) {
    errors.push(`INV-6: длительность ${plan.durationMin} мин, нужно от ${durationMin.min} до ${durationMin.max}`);
  }
}

/** id групп и карточек уникальны: по ним потом хранится прогресс учеников. */
function checkUniqueIds(plan: LessonCore, errors: string[]) {
  const seen = new Set<string>();
  const ids = [...plan.groups.map((g) => g.id), ...plan.groups.flatMap((g) => g.cards.map((c) => c.id))];
  for (const id of ids) {
    if (seen.has(id)) errors.push(`REF: id «${id}» встречается больше одного раза`);
    seen.add(id);
  }
}

/** Инвариант 1: у каждой группы отрезки идут подряд и покрывают [0, durationMin). */
function checkCoverage(plan: LessonCore, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const [groupId, segments] of byGroup) {
    if (segments.length === 0) {
      errors.push(`INV-1: у группы ${groupId} нет ни одного отрезка`);
      continue;
    }
    let cursor = 0;
    for (const seg of segments) {
      if (seg.endMin <= seg.startMin) {
        errors.push(`INV-1: у группы ${groupId} пустой или перевёрнутый отрезок ${range(seg)}`);
        continue;
      }
      if (seg.startMin > cursor) {
        errors.push(`INV-1: у группы ${groupId} дыра в таймлайне на ${cursor}–${seg.startMin} мин`);
      } else if (seg.startMin < cursor) {
        errors.push(`INV-1: у группы ${groupId} отрезки накладываются на ${seg.startMin}–${cursor} мин`);
      }
      cursor = Math.max(cursor, seg.endMin);
    }
    if (cursor < plan.durationMin) {
      errors.push(`INV-1: у группы ${groupId} дыра в таймлайне на ${cursor}–${plan.durationMin} мин`);
    } else if (cursor > plan.durationMin) {
      errors.push(`INV-1: у группы ${groupId} таймлайн выходит за конец урока (${cursor} > ${plan.durationMin} мин)`);
    }
  }
}

/**
 * Инвариант 2: в любую минуту учитель работает максимум с одной группой.
 * Исключение — joint (общий этап): тогда в этой минуте в режиме joint должны быть ВСЕ группы.
 * Проверяем поминутно (урок ≤ 90 минут, это дёшево), а одинаковые конфликты
 * в соседних минутах склеиваем в один диапазон, чтобы не было 10 одинаковых ошибок.
 */
function checkTeacherLoad(plan: LessonCore, errors: string[]) {
  const allGroups = plan.groups.map((g) => g.id);
  const conflictAt = (minute: number): string | null => {
    const active = plan.timeline.filter((s) => s.startMin <= minute && minute < s.endMin);
    const withTeacher = unique(active.filter((s) => s.mode === "with_teacher").map((s) => s.groupId));
    const joint = unique(active.filter((s) => s.mode === "joint").map((s) => s.groupId));

    if (joint.length > 0 && joint.length < allGroups.length) {
      const notJoint = allGroups.filter((id) => !joint.includes(id));
      return `общий этап (joint) у ${joint.join(", ")}, но не у ${notJoint.join(", ")}`;
    }
    if (withTeacher.length > 1) {
      return `учитель одновременно с группами ${withTeacher.join(", ")}`;
    }
    return null;
  };

  let runStart = 0;
  let runMessage: string | null = null;
  for (let minute = 0; minute <= plan.durationMin; minute++) {
    const message = minute < plan.durationMin ? conflictAt(minute) : null;
    if (message === runMessage) continue;
    if (runMessage) errors.push(`INV-2: на ${runStart}–${minute} мин ${runMessage}`);
    runStart = minute;
    runMessage = message;
  }
}

/** Инвариант 3: у каждой группы есть время с учителем и время на самостоятельную работу. */
function checkModesPresent(plan: LessonCore, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const [groupId, segments] of byGroup) {
    if (!segments.some((s) => s.mode === "with_teacher")) {
      errors.push(`INV-3: у группы ${groupId} нет ни одного отрезка с учителем (with_teacher)`);
    }
    if (!segments.some((s) => s.mode === "independent")) {
      errors.push(`INV-3: у группы ${groupId} нет самостоятельной работы (independent)`);
    }
  }
}

/**
 * Инварианты 4 и 5: карточки самостоятельной работы существуют, у закрытых есть ответ,
 * и каждая карточка стоит ровно в одном отрезке самостоятельной работы. Без последнего
 * правила модель составляла урок, где класс после объяснения так и не решал задачи по новой теме.
 */
function checkCards(plan: LessonCore, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const group of plan.groups) {
    const cardIds = new Set(group.cards.map((c) => c.id));
    for (const seg of byGroup.get(group.id) ?? []) {
      if (seg.mode !== "independent") continue;
      // Самостоятельная работа без карточек — ровно та проблема, которую решает продукт.
      if (!seg.cardIds || seg.cardIds.length === 0) {
        errors.push(`INV-4: у группы ${group.id} самостоятельная работа ${range(seg)} без карточек`);
        continue;
      }
      for (const id of seg.cardIds) {
        if (!cardIds.has(id)) {
          errors.push(`INV-4: отрезок ${range(seg)} группы ${group.id} ссылается на несуществующую карточку «${id}»`);
        }
      }
    }
    const uses = new Map<string, number>();
    for (const seg of byGroup.get(group.id) ?? []) {
      if (seg.mode === "independent") for (const id of seg.cardIds ?? []) uses.set(id, (uses.get(id) ?? 0) + 1);
    }
    for (const card of group.cards) {
      const used = uses.get(card.id) ?? 0;
      if (used === 0) errors.push(`INV-4: карточка ${card.id} группы ${group.id} не стоит ни в одном отрезке самостоятельной работы`);
      if (used > 1) errors.push(`INV-4: карточка ${card.id} группы ${group.id} стоит в ${used} отрезках, нужна ровно в одном`);
      if (card.type === "closed" && !card.answer?.trim()) {
        errors.push(`INV-5: у закрытой карточки ${card.id} нет ответа для самопроверки`);
      }
    }
  }
}

/**
 * Инвариант 7: новая тема не раньше объяснения учителя.
 * Пока класс ещё не работал с учителем, он может делать только карточки повторения (review).
 * И у каждого класса есть хотя бы одна карточка по новой теме (practice), иначе урок не про тему.
 */
function checkCardOrder(plan: LessonCore, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const group of plan.groups) {
    const segments = byGroup.get(group.id) ?? [];
    const firstTeacher = segments.find((s) => s.mode === "with_teacher");
    if (firstTeacher) {
      const purposeOf = new Map(group.cards.map((c) => [c.id, c.purpose]));
      for (const seg of segments) {
        if (seg.mode !== "independent" || seg.startMin >= firstTeacher.startMin) continue;
        const early = (seg.cardIds ?? []).filter((id) => purposeOf.get(id) === "practice");
        if (early.length) {
          errors.push(
            `INV-7: у группы ${group.id} на ${range(seg)} карточки по новой теме (${early.join(", ")}) до объяснения учителя ` +
              `(${firstTeacher.startMin} мин); до него можно только повторение (purpose: review)`,
          );
        }
      }
    }
    if (!group.cards.some((c) => c.purpose === "practice")) {
      errors.push(`INV-7: у группы ${group.id} нет ни одной карточки по новой теме (purpose: practice)`);
    }
  }
}

/**
 * Инвариант 10: заданий хватает на всё время, пока класс работает без учителя.
 * Если карточки кончились раньше, класс сидит без дела, а учитель занят с другим классом: ровно то,
 * что продукт должен убрать. Считаем по минутам, которые модель указала для среднего ученика этого класса.
 * Слишком «долгую» карточку не принимаем: так модель могла бы закрыть время двумя заданиями.
 * У уроков без минут (сохранённых до 18 ноября) проверку пропускаем.
 */
export const maxCardMinutes = (grade: number) => (grade <= 4 ? 10 : 15);

/**
 * Темп: примерно столько минут в среднем уходит на одну карточку. Оценку минут модель может завысить
 * («сложить 36 и 18 — 5 минут»), а число карточек она не завысит: по темпу код считает, сколько карточек
 * нужно не меньше, и передаёт это число модели готовым.
 */
export const cardPace = (grade: number) => (grade <= 4 ? 4 : 6);

/** Сколько карточек нужно не меньше: на всё время по темпу, у практики ещё одна в запас. */
export function minCards(grade: number, reviewMinutes: number, practiceMinutes: number) {
  return {
    review: reviewMinutes > 0 ? Math.max(1, Math.ceil((reviewMinutes * 0.9) / cardPace(grade))) : 0,
    practice: Math.max(3, Math.ceil(practiceMinutes / cardPace(grade)) + 1),
  };
}

function checkTiming(plan: LessonCore, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const group of plan.groups) {
    if (!group.cards.every((c) => typeof c.minutes === "number")) continue;
    const segments = byGroup.get(group.id) ?? [];
    const firstTeacher = segments.find((s) => s.mode === "with_teacher")?.startMin ?? Infinity;
    const length = (s: Segment) => s.endMin - s.startMin;
    const reviewTime = segments.filter((s) => s.mode === "independent" && s.startMin < firstTeacher).reduce((n, s) => n + length(s), 0);
    const practiceTime = segments.filter((s) => s.mode === "independent" && s.startMin >= firstTeacher).reduce((n, s) => n + length(s), 0);
    const sum = (purpose: string) => group.cards.filter((c) => c.purpose === purpose).reduce((n, c) => n + (c.minutes ?? 0), 0);
    const review = reviewTime > 0 ? sum("review") : 0;
    const practice = sum("practice") + (reviewTime > 0 ? 0 : sum("review"));
    const count = (purpose: string) => group.cards.filter((c) => c.purpose === purpose).length;
    const need = minCards(group.grade, reviewTime, practiceTime);
    const reviewCount = reviewTime > 0 ? count("review") : 0;
    const practiceCount = count("practice") + (reviewTime > 0 ? 0 : count("review"));
    if (reviewCount < need.review) {
      errors.push(`TIME: у группы ${group.id} на ${reviewTime} мин повторения нужно не меньше ${need.review} карточек review, а их ${reviewCount}; добавь ${need.review - reviewCount}`);
    }
    if (practiceCount < need.practice) {
      errors.push(`TIME: у группы ${group.id} на ${practiceTime} мин практики нужно не меньше ${need.practice} карточек practice (с запасом), а их ${practiceCount}; добавь ${need.practice - practiceCount}`);
    }
    if (reviewTime > 0 && review < reviewTime * 0.9) {
      errors.push(`TIME: у группы ${group.id} повторение длится ${reviewTime} мин, а карточек review на ${review} мин; добавь карточки review`);
    }
    if (practice < practiceTime) {
      errors.push(`TIME: у группы ${group.id} самостоятельная практика длится ${practiceTime} мин, а карточек practice на ${practice} мин; добавь карточки, в том числе 1–2 в запас для быстрых учеников`);
    }
    for (const card of group.cards) {
      if ((card.minutes ?? 0) > maxCardMinutes(group.grade)) {
        errors.push(`TIME: карточка ${card.id} оценена в ${card.minutes} мин, для ${group.grade} класса это слишком долго; раздели её на две или оцени честно`);
      }
    }
  }
}

/**
 * Инвариант 8: подсказка не выдаёт ответ. Подсказка ведёт к решению, а не заменяет его,
 * иначе самопроверка теряет смысл. Ищем ответ целым словом или числом, без учёта регистра;
 * однобуквенные ответы («5», «а») не проверяем: они случайно встречаются в любом тексте.
 */
function checkHints(plan: LessonCore, errors: string[]) {
  for (const card of plan.groups.flatMap((g) => g.cards)) {
    if (hintContainsAnswer(card.hint, card.answer ?? "")) {
      errors.push(`INV-8: подсказка карточки ${card.id} содержит ответ; подсказка должна вести к решению, не называя ответ`);
    }
  }
}

/** Ответ целым словом или числом внутри подсказки; однобуквенные ответы не проверяем. */
export function hintContainsAnswer(hint: string, answer: string): boolean {
  const a = normalize(answer);
  return a.length >= 2 && ` ${normalize(hint)} `.includes(` ${a} `);
}

/**
 * Строгая проверка для подсказок, которые ИИ пишет ученику во время урока (guard из SPEC §6).
 * Кроме ответа целиком, ловим числа из ответа, которых нет в условии: «Попробуй 216» выдаёт ответ,
 * а «Сколько раз 4 помещается в 8?» нет, если 4 и 8 есть в самом задании.
 */
export function hintRevealsAnswer(hint: string, answer: string, prompt: string): boolean {
  if (!answer.trim()) return false;
  if (hintContainsAnswer(hint, answer)) return true;
  const a = normalize(answer);
  if (a.length === 1 && ` ${normalize(hint)} `.includes(` ${a} `) && !` ${normalize(prompt)} `.includes(` ${a} `)) return true;
  const inPrompt = new Set(numbersIn(prompt));
  const secret = numbersIn(answer).filter((n) => !inPrompt.has(n));
  const inHint = new Set(numbersIn(hint));
  return secret.length > 0 && secret.every((n) => inHint.has(n));
}

function numbersIn(text: string): string[] {
  return [...text.replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, "$1").matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));
}

/**
 * Инвариант 9: числовые равенства в карточках и этапах урока верны («6 + 8 = 14»).
 * Ответ карточки сверяем, когда задание — одно выражение без других чисел («Вычисли: 47 + 25»).
 */
function checkPlanArithmetic(plan: LessonCore, errors: string[]) {
  const texts = [
    ...plan.timeline.map((s) => s.activity),
    ...plan.groups.flatMap((g) => g.cards.flatMap((c) => [c.prompt, c.hint, c.successCriteria])),
  ];
  for (const text of texts) {
    const wrong = findWrongEquation(text);
    if (wrong) errors.push(`INV-9: неверное равенство «${wrong}»; пересчитай`);
  }
  const allTexts = [...texts, plan.teacherNotes, ...plan.groups.flatMap((g) => [g.learningGoal, g.homework, ...g.cards.map((c) => c.answer ?? "")])];
  for (const text of allTexts) {
    const word = findMixedScriptWord(text);
    if (word) errors.push(`TXT: опечатка «${word}»: в слове смешаны алфавиты`);
  }
  for (const card of plan.groups.flatMap((g) => g.cards)) {
    const wrong = wrongCardAnswer(card);
    if (wrong) errors.push(`INV-9: у карточки ${card.id} неверный ответ: ${wrong}; пересчитай`);
  }
}

/** Задание — одно выражение без других чисел («Вычисли: 47 + 25»): ответ можно пересчитать. */
function wrongCardAnswer(card: TaskCard): string | null {
  return card.answer ? wrongExpressionAnswer(card.prompt, card.answer) : null;
}

function wrongExpressionAnswer(task: string, answer: string): string | null {
  const expression = task.match(/^[^\d]*?(\d+(?:\s*[+\-−×·:]\s*\d+)+)\s*(?:=\s*\?)?\s*[.?]?$/);
  if (!expression || !/^\d+$/.test(answer.trim())) return null;
  return findWrongEquation(`${expression[1]} = ${answer.trim()}`);
}

/** Результат, который код посчитал для блока: частное, сумма, произведение. null, если блок не про число. */
function visualResult(v: Visual): number | null {
  if (v.kind === "long_division") return v.dividend % v.divisor === 0 ? v.dividend / v.divisor : null;
  if (v.kind === "column") return columnResult(v.a, v.b, v.op);
  return null;
}

/** Те же правила для одной карточки: когда учитель просит пересоздать её отдельно. */
export function checkSingleCard(card: TaskCard): string[] {
  const errors: string[] = [];
  if (card.type === "closed" && !card.answer?.trim()) errors.push("INV-5: у закрытой карточки нет ответа для самопроверки");
  if (hintContainsAnswer(card.hint, card.answer ?? "")) errors.push("INV-8: подсказка содержит ответ; подсказка должна вести к решению, не называя ответ");
  for (const text of [card.prompt, card.hint, card.successCriteria]) {
    const wrong = findWrongEquation(text);
    if (wrong) errors.push(`INV-9: неверное равенство «${wrong}»; пересчитай`);
  }
  const answerError = wrongCardAnswer(card);
  if (answerError) errors.push(`INV-9: неверный ответ: ${answerError}; пересчитай`);
  for (const text of [card.prompt, card.hint, card.successCriteria, card.answer ?? ""]) {
    const word = findMixedScriptWord(text);
    if (word) errors.push(`TXT: опечатка «${word}»: в слове смешаны алфавиты`);
  }
  return errors;
}

/** Нижний регистр, знаки препинания как пробелы: «72.» и «72» — одно и то же. */
function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function range(seg: Segment) {
  return `${seg.startMin}–${seg.endMin} мин`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
