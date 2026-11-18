import { describe, expect, it } from "vitest";
import { buildTimeline, planSchedule } from "@/lib/schedule";
import type { LessonCore, TaskCard } from "@/lib/schema";
import { minCards, validateLessonPlan } from "@/lib/validate";

/** Урок с карточками по 3 минуты: сколько нужно, чтобы занять всё время самостоятельной работы, и одна в запас. */
function lessonFor(groupCount: number, durationMin: number): LessonCore {
  const schedule = planSchedule(groupCount, durationMin);
  const groups = schedule.cards.map((plan, g) => {
    // Не больше 16 карточек: на длинном уроке карточки длиннее, как и сделал бы учитель.
    const need = minCards(g + 2, plan.reviewMinutes, plan.practiceMinutes);
    const review = need.review;
    const practice = need.practice;
    // Повторение ровно на своё время, практика с одной карточкой в запас.
    const minutes = (time: number, count: number) => Math.max(3, Math.ceil(time / Math.max(1, count)));
    const cards: TaskCard[] = [...Array(review).fill("review"), ...Array(practice).fill("practice")].map((purpose, i) => ({
      id: `g${g + 1}-c${i + 1}`, type: "open", prompt: "Задание", successCriteria: "Критерий", hint: "Подсказка",
      difficulty: 1, purpose,
      minutes: purpose === "review" ? minutes(plan.reviewMinutes, review) : minutes(plan.practiceMinutes, practice - 1),
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

  it("считает минуты самостоятельной работы и объяснения каждого класса", () => {
    // 45 минут, 2 класса: 5 мин начало, объяснения 5–17 и 17–28, проверки 28–34 и 34–40, 5 мин итог.
    expect(planSchedule(2, 45).cards).toEqual([
      { reviewMinutes: 0, practiceMinutes: 17, explainMinutes: 12 },
      { reviewMinutes: 12, practiceMinutes: 6, explainMinutes: 11 },
    ]);
    for (const groups of [2, 3]) {
      for (const c of planSchedule(groups, 45).cards) expect(c.reviewMinutes + c.practiceMinutes + c.explainMinutes).toBeLessThan(35);
    }
  });

  it("раскладывает карточки практики по отрезкам по их минутам, в каждом хотя бы одна", () => {
    const lesson = lessonFor(2, 45);
    const g1 = lesson.timeline.filter((s) => s.groupId === "g1" && s.mode === "independent");
    // 17–28 (11 мин) и 34–40 (6 мин): 13 карточек делятся по времени примерно 65% и 35%.
    expect(g1.map((s) => s.cardIds?.length)).toEqual([8, 5]);
    expect(g1.every((s) => (s.cardIds?.length ?? 0) >= 1)).toBe(true);
  });

  it("чередует учителя: объяснение каждому классу, потом проверка", () => {
    const lesson = lessonFor(2, 45);
    const teacher = lesson.timeline.filter((s) => s.mode === "with_teacher").map((s) => `${s.groupId} ${s.startMin}–${s.endMin} ${s.activity}`);
    expect(teacher).toEqual(["g1 5–17 explain", "g2 17–28 explain", "g1 28–34 check", "g2 34–40 check"]);
  });
});
