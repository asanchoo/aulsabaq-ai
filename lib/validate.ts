import { LessonPlanSchema, type LessonPlan, type Segment } from "./schema";

/**
 * validateLessonPlan — проверка СМЫСЛА урока (SPEC §5, инварианты 1–6).
 *
 * Zod уже гарантировал, что поля на месте и нужного типа. Но модель может вернуть
 * аккуратный JSON, по которому урок физически невозможно провести: учитель в одну
 * минуту с двумя классами, дыра в таймлайне, самостоятельная работа без карточек.
 * Эта функция ловит такие планы. Она чистая (без сети и БД), поэтому легко тестируется.
 *
 * Каждая ошибка начинается с кода (INV-1 … INV-6, REF), чтобы тесты и повторный
 * запрос к модели могли понять, что именно не так.
 */

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export const LIMITS = {
  groups: { min: 2, max: 3 },
  cards: { min: 3, max: 5 },
  durationMin: { min: 30, max: 90 },
} as const;

export function validateLessonPlan(plan: LessonPlan): ValidationResult {
  const errors: string[] = [];
  const byGroup = groupSegments(plan, errors);

  checkLimits(plan, errors);
  checkUniqueIds(plan, errors);
  checkCoverage(plan, byGroup, errors);
  checkTeacherLoad(plan, errors);
  checkModesPresent(plan, byGroup, errors);
  checkCards(plan, byGroup, errors);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Zod + validateLessonPlan за один вызов: для API-роутов и загрузки фикстур. */
export function parseLessonPlan(
  input: unknown,
): { ok: true; plan: LessonPlan } | { ok: false; errors: string[] } {
  const parsed = LessonPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `SCHEMA: ${issue.path.join(".") || "(корень)"}: ${issue.message}`,
      ),
    };
  }
  const result = validateLessonPlan(parsed.data);
  return result.ok ? { ok: true, plan: parsed.data } : result;
}

// ---------------------------------------------------------------------------

/** Раскладывает отрезки по группам; отрезки с несуществующей группой — ошибка REF. */
function groupSegments(plan: LessonPlan, errors: string[]): Map<string, Segment[]> {
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
function checkLimits(plan: LessonPlan, errors: string[]) {
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
function checkUniqueIds(plan: LessonPlan, errors: string[]) {
  const seen = new Set<string>();
  const ids = [...plan.groups.map((g) => g.id), ...plan.groups.flatMap((g) => g.cards.map((c) => c.id))];
  for (const id of ids) {
    if (seen.has(id)) errors.push(`REF: id «${id}» встречается больше одного раза`);
    seen.add(id);
  }
}

/** Инвариант 1: у каждой группы отрезки идут подряд и покрывают [0, durationMin). */
function checkCoverage(plan: LessonPlan, byGroup: Map<string, Segment[]>, errors: string[]) {
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
function checkTeacherLoad(plan: LessonPlan, errors: string[]) {
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
function checkModesPresent(plan: LessonPlan, byGroup: Map<string, Segment[]>, errors: string[]) {
  for (const [groupId, segments] of byGroup) {
    if (!segments.some((s) => s.mode === "with_teacher")) {
      errors.push(`INV-3: у группы ${groupId} нет ни одного отрезка с учителем (with_teacher)`);
    }
    if (!segments.some((s) => s.mode === "independent")) {
      errors.push(`INV-3: у группы ${groupId} нет самостоятельной работы (independent)`);
    }
  }
}

/** Инварианты 4 и 5: карточки самостоятельной работы существуют, у закрытых есть ответ. */
function checkCards(plan: LessonPlan, byGroup: Map<string, Segment[]>, errors: string[]) {
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
    for (const card of group.cards) {
      if (card.type === "closed" && !card.answer?.trim()) {
        errors.push(`INV-5: у закрытой карточки ${card.id} нет ответа для самопроверки`);
      }
    }
  }
}

function range(seg: Segment) {
  return `${seg.startMin}–${seg.endMin} мин`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
