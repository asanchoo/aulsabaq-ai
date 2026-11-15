import { findWrongEquation } from "./arithmetic";
import { ExplanationSchema, LessonCoreSchema, LessonPlanSchema, type Explanation, type LessonCore, type LessonPlan, type Segment } from "./schema";

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
  cards: { min: 3, max: 6 },
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

/** То же для урока без объяснений: ответ модели на запрос расписания и карточек. */
export function parseLessonCore(input: unknown): Parsed<LessonCore> {
  const parsed = LessonCoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error.issues) };
  const result = validateLessonPlan(parsed.data);
  return result.ok ? { ok: true, plan: parsed.data } : result;
}

/** Ответ модели на запрос объяснения одного класса: форма и арифметика. */
export function parseExplanation(input: unknown): Parsed<Explanation> {
  const parsed = ExplanationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error.issues) };
  const errors = checkExplanation(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, plan: parsed.data };
}

/**
 * Объяснение темы: каждое числовое равенство в нём верно (EXP), кроме раздела ошибок.
 * Учитель читает разбор примера классу, ошибка в счёте здесь хуже, чем в карточке.
 */
export function checkExplanation(e: Explanation, groupId?: string): string[] {
  const where = groupId ? ` у группы ${groupId}` : "";
  // mistakes не проверяем: там намеренно приводят неверный ответ ученика («63 − 28 = 45»).
  const texts = [e.hook, e.keyIdea, ...e.steps, e.example.problem, ...e.example.steps, e.example.answer, ...e.checkQuestions];
  const errors: string[] = [];
  for (const text of texts) {
    const wrong = findWrongEquation(text);
    if (wrong) errors.push(`EXP: в объяснении${where} неверное равенство «${wrong}»; пересчитай пример`);
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
 * Инвариант 8: подсказка не выдаёт ответ. Подсказка ведёт к решению, а не заменяет его,
 * иначе самопроверка теряет смысл. Ищем ответ целым словом или числом, без учёта регистра;
 * однобуквенные ответы («5», «а») не проверяем: они случайно встречаются в любом тексте.
 */
function checkHints(plan: LessonCore, errors: string[]) {
  for (const card of plan.groups.flatMap((g) => g.cards)) {
    const answer = normalize(card.answer ?? "");
    if (answer.length < 2) continue;
    if (` ${normalize(card.hint)} `.includes(` ${answer} `)) {
      errors.push(`INV-8: подсказка карточки ${card.id} содержит ответ; подсказка должна вести к решению, не называя ответ`);
    }
  }
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
  for (const card of plan.groups.flatMap((g) => g.cards)) {
    const expression = card.prompt.match(/^[^\d]*?(\d+(?:\s*[+\-−×·:]\s*\d+)+)\s*(?:=\s*\?)?\s*[.?]?$/);
    if (!expression || !card.answer || !/^\d+$/.test(card.answer.trim())) continue;
    const wrong = findWrongEquation(`${expression[1]} = ${card.answer.trim()}`);
    if (wrong) errors.push(`INV-9: у карточки ${card.id} неверный ответ: ${wrong}; пересчитай`);
  }
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
