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
 */

export type StageKind = "opening" | "review" | "explain" | "practice" | "check" | "closing";

export type PlannedSegment = { groupIndex: number; startMin: number; endMin: number; stage: StageKind };

export type GroupCardPlan = { review: number; practice: number };

export type Schedule = { segments: PlannedSegment[]; cards: GroupCardPlan[] };

const OPENING_MIN = 5;
const CLOSING_MIN = 5;
/** Доля середины урока на объяснения, остальное на проверки. */
const EXPLAIN_SHARE = 0.65;
/** Примерно столько минут самостоятельной работы на одну карточку. */
const MIN_PER_PRACTICE_CARD = 3.5;
const MIN_PER_REVIEW_CARD = 4;
const MAX_CARDS = 6;

/** Делит total минут на n частей, разница не больше минуты, первым достаётся больше. */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function planSchedule(groupCount: number, durationMin: number): Schedule {
  const middleStart = OPENING_MIN;
  const middleEnd = durationMin - CLOSING_MIN;
  const middle = middleEnd - middleStart;
  const explainTotal = Math.round(middle * EXPLAIN_SHARE);

  // Очередь учителя: объяснения всем классам по порядку, потом проверки по тому же порядку.
  const teacherBlocks: { groupIndex: number; stage: "explain" | "check"; length: number }[] = [
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
    const practiceSegments = own.filter((s) => s.stage === "practice").length;
    const review = minutes("review") > 0 ? clamp(Math.round(minutes("review") / MIN_PER_REVIEW_CARD), 1, 3) : 0;
    const practice = clamp(
      Math.round(minutes("practice") / MIN_PER_PRACTICE_CARD),
      Math.max(2, practiceSegments, 3 - review), // в каждом отрезке хотя бы одна карточка, всего не меньше трёх
      MAX_CARDS - review,
    );
    return { review, practice };
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
export function assignCards(segments: PlannedSegment[], cards: Pick<TaskCard, "id" | "purpose">[]): Map<PlannedSegment, string[]> {
  const result = new Map<PlannedSegment, string[]>();
  const review = segments.find((s) => s.stage === "review");
  const practice = segments.filter((s) => s.stage === "practice");
  const reviewIds = cards.filter((c) => c.purpose === "review").map((c) => c.id);
  const practiceIds = cards.filter((c) => c.purpose === "practice").map((c) => c.id);

  if (review) result.set(review, reviewIds);
  const counts = practice.map(() => 1);
  for (let left = practiceIds.length - practice.length; left > 0; left--) {
    // Следующая карточка туда, где больше всего минут на одну карточку.
    let best = 0;
    practice.forEach((s, i) => {
      if ((s.endMin - s.startMin) / counts[i] > (practice[best].endMin - practice[best].startMin) / counts[best]) best = i;
    });
    counts[best]++;
  }
  let next = 0;
  practice.forEach((s, i) => {
    const ids = practiceIds.slice(next, next + counts[i]);
    next += counts[i];
    result.set(s, i === 0 && !review ? [...reviewIds, ...ids] : ids);
  });
  return result;
}

/** Готовый таймлайн: этапы → отрезки урока с режимом, текстом этапа и карточками. */
export function buildTimeline(
  schedule: Schedule,
  groups: { id: string; cards: Pick<TaskCard, "id" | "purpose">[]; stageText: (stage: StageKind) => string }[],
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
