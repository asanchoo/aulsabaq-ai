import { t, type Dict } from "./i18n";
import type { Group, LessonPlan, Segment } from "./schema";

/**
 * Помощники для отображения урока. Чистые функции без React —
 * их используют и партитура на главной, и таймлайн, и «Скопировать урок».
 */

/** Отрезок группы, который идёт в указанную минуту. */
export function segmentAt(plan: LessonPlan, groupId: string, minute: number): Segment | undefined {
  return plan.timeline.find((s) => s.groupId === groupId && s.startMin <= minute && minute < s.endMin);
}

/** Номер карточки внутри своей группы (1, 2, 3…) — так её называет учитель. */
export function cardNumber(group: Group, cardId: string): number | null {
  const index = group.cards.findIndex((c) => c.id === cardId);
  return index === -1 ? null : index + 1;
}

export function cardNumbers(group: Group, cardIds: string[] | undefined): number[] {
  return (cardIds ?? []).map((id) => cardNumber(group, id)).filter((n): n is number => n !== null);
}

export type TimeSlot = {
  startMin: number;
  endMin: number;
  /** Все группы в этом промежутке на общем этапе. */
  allJoint: boolean;
  rows: { group: Group; segment: Segment | undefined }[];
};

/**
 * Режет урок на промежутки по всем границам отрезков всех групп.
 * Внутри промежутка ни одна группа не меняет занятие — удобно для мобильного вида
 * «что происходит с 5 по 15 минуту».
 */
export function timeSlots(plan: LessonPlan): TimeSlot[] {
  const bounds = new Set<number>([0, plan.durationMin]);
  for (const s of plan.timeline) {
    bounds.add(s.startMin);
    bounds.add(s.endMin);
  }
  const sorted = [...bounds].filter((b) => b >= 0 && b <= plan.durationMin).sort((a, b) => a - b);

  const slots: TimeSlot[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const startMin = sorted[i];
    const rows = plan.groups.map((group) => ({ group, segment: segmentAt(plan, group.id, startMin) }));
    slots.push({
      startMin,
      endMin: sorted[i + 1],
      allJoint: rows.every((r) => r.segment?.mode === "joint"),
      rows,
    });
  }
  return slots;
}

/**
 * Урок как простой текст — для кнопки «Скопировать» (вставить в WhatsApp, Word, КСП).
 */
export function lessonToText(plan: LessonPlan, dict: Dict): string {
  const lines: string[] = [];
  const grades = plan.groups.map((g) => t(dict.common.grade, { n: g.grade })).join(", ");
  lines.push(`${plan.subject} · ${grades} · ${t(dict.lesson.duration, { n: plan.durationMin })}`, "");

  for (const g of plan.groups) {
    lines.push(`${t(dict.common.grade, { n: g.grade })}: ${g.topic}`, `${dict.lesson.goal}: ${g.learningGoal}`);
  }

  lines.push("", `${dict.lesson.timelineTitle}:`);
  for (const slot of timeSlots(plan)) {
    const time = t(dict.common.minuteRange, { a: slot.startMin, b: slot.endMin });
    if (slot.allJoint) {
      lines.push(`${time} — ${dict.common.allGroups} (${dict.modes.joint}): ${slot.rows[0]?.segment?.activity ?? ""}`);
      continue;
    }
    lines.push(time);
    for (const { group, segment } of slot.rows) {
      if (!segment) continue;
      const nums = cardNumbers(group, segment.cardIds);
      const cards = nums.length ? ` [${t(dict.common.cards, { list: nums.join(", ") })}]` : "";
      lines.push(`  ${t(dict.common.grade, { n: group.grade })} — ${dict.modes[segment.mode]}: ${segment.activity}${cards}`);
    }
  }

  const ex = dict.lesson.explain;
  const numbered = (items: string[]) => items.map((item, i) => `  ${i + 1}. ${item}`);
  const bullets = (items: string[]) => items.map((item) => `  • ${item}`);
  for (const g of plan.groups) {
    const e = g.explanation;
    lines.push(
      "",
      `${dict.lesson.explainTitle} — ${t(dict.common.grade, { n: g.grade })}: ${g.topic}`,
      `${ex.hook}: ${e.hook}`,
      `${ex.keyIdea}: ${e.keyIdea}`,
      `${ex.steps}:`, ...numbered(e.steps),
      `${ex.example}: ${e.example.problem}`, ...numbered(e.example.steps), `  ${dict.lesson.answer}: ${e.example.answer}`,
      `${ex.mistakes}:`, ...bullets(e.mistakes),
      `${ex.checkQuestions}:`, ...bullets(e.checkQuestions),
    );
  }

  for (const g of plan.groups) {
    lines.push("", `${dict.lesson.cardsTitle} — ${t(dict.common.grade, { n: g.grade })}`);
    g.cards.forEach((c, i) => {
      lines.push(`${t(dict.common.card, { n: i + 1 })} (${dict.lesson.purpose[c.purpose]}). ${c.prompt}`);
      lines.push(`   ${dict.lesson.hint}: ${c.hint}`);
      if (c.answer) lines.push(`   ${dict.lesson.answer}: ${c.answer}`);
    });
    lines.push(`${dict.lesson.homework}: ${g.homework}`);
  }

  if (plan.teacherNotes) lines.push("", `${dict.lesson.notesTitle}:`, plan.teacherNotes);
  return lines.join("\n");
}
