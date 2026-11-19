import type { Segment, TaskCard } from "./schema";

/**
 * Расписание совмещённого урока считает код, а не модель.
 *
 * Это задача на минуты, а не на педагогику: учитель по очереди объясняет новую тему каждому
 * классу, потом по очереди проверяет. Облегчённая модель в ней ошибалась (наложения, учитель
 * с двумя классами сразу), а алгоритм не ошибается никогда. Модель пишет содержание:
 * цели, карточки, что происходит на каждом этапе, а код раскладывает это по минутам.
 *
 * Схема для каждого класса:
 *   общее начало → [сам: повторение] → с учителем: объяснение → сам: практика →
 *   с учителем: проверка → [сам: практика] → общий итог.
 * Первый класс начинает сразу с учителем, поэтому повторения у него нет.
 * Один класс: объяснение, потом класс сам решает карточки, потом учитель проверяет. Без отрезка
 * самостоятельной работы между объяснением и проверкой карточкам было бы некуда встать.
 */

export type StageKind = "opening" | "review" | "explain" | "practice" | "check" | "closing";

export type PlannedSegment = { groupIndex: number; startMin: number; endMin: number; stage: StageKind };

/**
 * Сколько минут класс работает сам до объяснения (повторение) и после (практика), и сколько минут
 * у учителя на объяснение ему новой темы. Количество карточек и слайдов модель подбирает под эти минуты.
 */
export type GroupCardPlan = { reviewMinutes: number; practiceMinutes: number; explainMinutes: number };

export type Schedule = { segments: PlannedSegment[]; cards: GroupCardPlan[] };

const OPENING_MIN = 5;
const CLOSING_MIN = 5;
/** Доля середины урока на объяснения, остальное на проверки. */
const EXPLAIN_SHARE = 0.65;
/** Один класс: доли середины урока на объяснение и на самостоятельную работу, остальное на проверку. */
const SOLO_EXPLAIN_SHARE = 0.4;
const SOLO_PRACTICE_SHARE = 0.35;
/** Классов в кабинете: от одного до четырёх (комплект 1–4 классов бывает в начальной школе). */
export const MAX_GROUPS = 4;
/** Больше карточек одному классу не даём: на сдвоенный урок в 90 минут хватает с запасом. */
export const MAX_CARDS = 30;
/** По новой теме не меньше стольких карточек, даже если практики мало. */
export const MIN_PRACTICE_CARDS = 4;

/** Делит total минут на n частей, разница не больше минуты, первым достаётся больше. */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}


export function planSchedule(groupCount: number, durationMin: number): Schedule {
  const middleStart = OPENING_MIN;
  const middleEnd = durationMin - CLOSING_MIN;
  const middle = middleEnd - middleStart;
  const explainTotal = Math.round(middle * EXPLAIN_SHARE);

  // Очередь учителя: объяснения всем классам по порядку, потом проверки по тому же порядку.
  // У одного класса между объяснением и проверкой учитель «свободен»: класс решает карточки сам.
  type Block = { groupIndex: number; stage: "explain" | "check" | "practice"; length: number };
  const soloExplain = Math.round(middle * SOLO_EXPLAIN_SHARE);
  const soloPractice = Math.round(middle * SOLO_PRACTICE_SHARE);
  const teacherBlocks: Block[] = groupCount === 1
    ? [
        { groupIndex: 0, stage: "explain", length: soloExplain },
        { groupIndex: 0, stage: "practice", length: soloPractice },
        { groupIndex: 0, stage: "check", length: middle - soloExplain - soloPractice },
      ]
    : [
        ...split(explainTotal, groupCount).map((length, groupIndex) => ({ groupIndex, stage: "explain" as const, length })),
        ...split(middle - explainTotal, groupCount).map((length, groupIndex) => ({ groupIndex, stage: "check" as const, length })),
      ];

  const segments: PlannedSegment[] = [];
  for (let g = 0; g < groupCount; g++) segments.push({ groupIndex: g, startMin: 0, endMin: OPENING_MIN, stage: "opening" });

  // Пока учитель с одним классом, остальные работают сами: до своего объяснения повторяют, после — практикуются.
  let cursor = middleStart;
  const explained = new Set<number>();
  for (const block of teacherBlocks) {
    const end = cursor + block.length;
    for (let g = 0; g < groupCount; g++) {
      const stage: StageKind = g === block.groupIndex ? block.stage : explained.has(g) ? "practice" : "review";
      segments.push({ groupIndex: g, startMin: cursor, endMin: end, stage });
    }
    if (block.stage === "explain") explained.add(block.groupIndex);
    cursor = end;
  }
  for (let g = 0; g < groupCount; g++) segments.push({ groupIndex: g, startMin: middleEnd, endMin: durationMin, stage: "closing" });

  const merged = mergeAdjacent(segments);
  const cards = Array.from({ length: groupCount }, (_, g) => {
    const own = merged.filter((s) => s.groupIndex === g);
    const minutes = (stage: StageKind) => own.filter((s) => s.stage === stage).reduce((sum, s) => sum + s.endMin - s.startMin, 0);
    return { reviewMinutes: minutes("review"), practiceMinutes: minutes("practice"), explainMinutes: minutes("explain") };
  });
  return { segments: merged, cards };
}

/** Соседние отрезки одного класса с одним этапом склеиваем: «сам 5–17» и «сам 17–28» — это одна работа. */
function mergeAdjacent(segments: PlannedSegment[]): PlannedSegment[] {
  const sorted = [...segments].sort((a, b) => a.groupIndex - b.groupIndex || a.startMin - b.startMin);
  const out: PlannedSegment[] = [];
  for (const seg of sorted) {
    const last = out[out.length - 1];
    if (last && last.groupIndex === seg.groupIndex && last.stage === seg.stage && last.endMin === seg.startMin) last.endMin = seg.endMin;
    else out.push({ ...seg });
  }
  return out;
}

const MODE: Record<StageKind, Segment["mode"]> = {
  opening: "joint",
  closing: "joint",
  explain: "with_teacher",
  check: "with_teacher",
  review: "independent",
  practice: "independent",
};

/**
 * Карточки класса по отрезкам: повторение в отрезок «повторение», практика по отрезкам практики
 * пропорционально их длине, в каждом хотя бы одна. Карточки повторения у класса без такого
 * отрезка (первый класс) уходят в начало первой практики: повторить после объяснения тоже можно.
 */
export function assignCards(segments: PlannedSegment[], cards: Pick<TaskCard, "id" | "purpose" | "minutes">[]): Map<PlannedSegment, string[]> {
  const result = new Map<PlannedSegment, string[]>();
  const review = segments.find((s) => s.stage === "review");
  const practice = segments.filter((s) => s.stage === "practice");
  const reviewCards = cards.filter((c) => c.purpose === "review");
  // Повторение без своего отрезка (у первого класса) решают в начале первой практики.
  const practiceCards = [...(review ? [] : reviewCards), ...cards.filter((c) => c.purpose === "practice")];
  if (review) result.set(review, reviewCards.map((c) => c.id));
  if (practice.length === 0) return result;

  // Карточки идут по порядку и раскладываются по отрезкам практики по своим минутам:
  // карточка попадает в тот отрезок, на который приходится её середина по времени.
  const length = (s: PlannedSegment) => s.endMin - s.startMin;
  const total = practice.reduce((sum, s) => sum + length(s), 0);
  const minutes = practiceCards.map((c) => c.minutes ?? 3);
  const workload = minutes.reduce((a, b) => a + b, 0) || 1;
  const buckets: string[][] = practice.map(() => []);
  let done = 0;
  practiceCards.forEach((card, k) => {
    const at = ((done + minutes[k] / 2) / workload) * total;
    done += minutes[k];
    let edge = 0;
    const index = practice.findIndex((s) => (edge += length(s)) > at);
    buckets[index === -1 ? practice.length - 1 : index].push(card.id);
  });
  // В каждом отрезке практики хотя бы одна карточка: берём у соседа, у которого их больше одной.
  buckets.forEach((bucket, i) => {
    if (bucket.length) return;
    const donor = [i - 1, i + 1].find((j) => (buckets[j]?.length ?? 0) > 1);
    if (donor === undefined) return;
    bucket.push(donor < i ? buckets[donor].pop()! : buckets[donor].shift()!);
  });
  practice.forEach((s, i) => result.set(s, buckets[i]));
  return result;
}

/** Готовый таймлайн: этапы → отрезки урока с режимом, текстом этапа и карточками. */
export function buildTimeline(
  schedule: Schedule,
  groups: { id: string; cards: Pick<TaskCard, "id" | "purpose" | "minutes">[]; stageText: (stage: StageKind) => string }[],
): Segment[] {
  const timeline: Segment[] = [];
  groups.forEach((group, g) => {
    const own = schedule.segments.filter((s) => s.groupIndex === g);
    const cardsBySegment = assignCards(own, group.cards);
    for (const seg of own) {
      const cardIds = cardsBySegment.get(seg);
      timeline.push({
        groupId: group.id,
        startMin: seg.startMin,
        endMin: seg.endMin,
        mode: MODE[seg.stage],
        activity: group.stageText(seg.stage),
        ...(MODE[seg.stage] === "independent" ? { cardIds: cardIds ?? [] } : {}),
      });
    }
  });
  return timeline.sort((a, b) => a.startMin - b.startMin || a.groupId.localeCompare(b.groupId));
}
