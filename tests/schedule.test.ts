import { describe, expect, it } from "vitest";
import { buildTimeline, planSchedule } from "@/lib/schedule";
import type { LessonCore, TaskCard } from "@/lib/schema";
import { validateLessonPlan } from "@/lib/validate";

/** Урок с карточками ровно того количества, которое просит расписание. */
function lessonFor(groupCount: number, durationMin: number): LessonCore {
  const schedule = planSchedule(groupCount, durationMin);
  const groups = schedule.cards.map((plan, g) => {
    const cards: TaskCard[] = [...Array(plan.review).fill("review"), ...Array(plan.practice).fill("practice")].map((purpose, i) => ({
      id: `g${g + 1}-c${i + 1}`, type: "open", prompt: "Задание", successCriteria: "Критерий", hint: "Подсказка",
      difficulty: 1, purpose,
    }));
    return { id: `g${g + 1}`, grade: g + 2, topic: "Тема", learningGoal: "Цель", cards, homework: "Дома" };
  });
  const timeline = buildTimeline(schedule, groups.map((g) => ({ ...g, stageText: (stage) => stage })));
  return { subject: "Математика", language: "ru", durationMin, groups, timeline, teacherNotes: "" };
}

describe("planSchedule", () => {
  it("строит урок, который проходит все правила, для 2 и 3 классов и любой длительности", () => {
    for (const groups of [2, 3]) {
      for (let duration = 30; duration <= 90; duration += 5) {
        const result = validateLessonPlan(lessonFor(groups, duration));
        expect([groups, duration, result]).toEqual([groups, duration, { ok: true }]);
      }
    }
  });

  it("даёт каждому классу 5–6 карточек на обычном уроке в 45 минут", () => {
    for (const groups of [2, 3]) {
      for (const { review, practice } of planSchedule(groups, 45).cards) {
        expect(review + practice).toBeGreaterThanOrEqual(5);
        expect(review + practice).toBeLessThanOrEqual(6);
      }
    }
  });

  it("чередует учителя: объяснение каждому классу, потом проверка", () => {
    const lesson = lessonFor(2, 45);
    const teacher = lesson.timeline.filter((s) => s.mode === "with_teacher").map((s) => `${s.groupId} ${s.startMin}–${s.endMin} ${s.activity}`);
    expect(teacher).toEqual(["g1 5–17 explain", "g2 17–28 explain", "g1 28–34 check", "g2 34–40 check"]);
  });
});
