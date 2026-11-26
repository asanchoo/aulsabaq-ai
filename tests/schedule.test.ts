import { describe, expect, it } from "vitest";
import { buildTimeline, planSchedule } from "@/lib/schedule";
import type { LessonCore, Rooms, TaskCard } from "@/lib/schema";
import { contentToLesson, type GeneratedContent } from "@/lib/generation-schema";
import { lessonInstructions } from "@/lib/prompts";
import { minCards, validateLessonPlan } from "@/lib/validate";

/** Урок с карточками по 3 минуты: сколько нужно, чтобы занять всё время самостоятельной работы, и одна в запас. */
function lessonFor(groupCount: number, durationMin: number, rooms: Rooms = "one"): LessonCore {
  const schedule = planSchedule(groupCount, durationMin, rooms);
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
  return { subject: "Математика", language: "ru", durationMin, ...(schedule.rooms === "separate" ? { rooms: "separate" as const } : {}), groups, timeline, teacherNotes: "" };
}

describe("planSchedule", () => {
  it("строит урок, который проходит все правила, для 1–4 классов и любой длительности", () => {
    for (const groups of [1, 2, 3, 4]) {
      for (let duration = 30; duration <= 90; duration += 5) {
        const result = validateLessonPlan(lessonFor(groups, duration));
        expect([groups, duration, result]).toEqual([groups, duration, { ok: true }]);
      }
    }
  });

  it("один класс: объяснение, сам решает карточки, проверка", () => {
    const { segments, cards } = planSchedule(1, 45);
    expect(segments.map((s) => [s.stage, s.startMin, s.endMin])).toEqual([
      ["opening", 0, 5], ["explain", 5, 19], ["practice", 19, 31], ["check", 31, 40], ["closing", 40, 45],
    ]);
    expect(cards).toEqual([{ reviewMinutes: 0, practiceMinutes: 12, explainMinutes: 14 }]);
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

describe("классы в разных кабинетах", () => {
  it("общего начала и итога нет, учитель с первой до последней минуты ровно с одним классом", () => {
    for (const groups of [2, 3, 4]) {
      for (let duration = 30; duration <= 90; duration += 5) {
        const lesson = lessonFor(groups, duration, "separate");
        expect([groups, duration, validateLessonPlan(lesson)]).toEqual([groups, duration, { ok: true }]);
        expect(lesson.timeline.some((s) => s.mode === "joint")).toBe(false);
        for (let minute = 0; minute < duration; minute++) {
          const withTeacher = lesson.timeline.filter((s) => s.mode === "with_teacher" && s.startMin <= minute && minute < s.endMin);
          expect([groups, duration, minute, withTeacher.length]).toEqual([groups, duration, minute, 1]);
        }
      }
    }
  });

  it("первый класс сразу с учителем, второй начинает сам с повторения, проверка второго в конце урока", () => {
    const { segments, rooms } = planSchedule(2, 45, "separate");
    expect(rooms).toBe("separate");
    expect(segments.map((s) => [s.groupIndex, s.stage, s.startMin, s.endMin])).toEqual([
      [0, "explain", 0, 15], [0, "practice", 15, 29], [0, "check", 29, 37], [0, "practice", 37, 45],
      [1, "review", 0, 15], [1, "explain", 15, 29], [1, "practice", 29, 37], [1, "check", 37, 45],
    ]);
  });

  it("один класс: кабинет ни на что не влияет", () => {
    expect(planSchedule(1, 45, "separate")).toEqual(planSchedule(1, 45));
  });

  it("проверка урока не пропускает общий этап, если классы в разных кабинетах", () => {
    const lesson = { ...lessonFor(2, 45), rooms: "separate" as const };
    const result = validateLessonPlan(lesson);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.join(" ")).toMatch(/INV-2: .*разных кабинетах/u);
  });

  it("сборка урока: тексты начала и конца уходят в заметку учителю, в таймлайне их нет", () => {
    const schedule = planSchedule(2, 45, "separate");
    const card = { type: "open" as const, prompt: "Задание", successCriteria: "Критерий", hint: "Подсказка", difficulty: 1 as const, variant: null, answer: null, accept: [], inputHint: null, minutes: 2 };
    const content: GeneratedContent = {
      subject: "Математика", language: "ru", durationMin: 45,
      opening: "До звонка раздайте карточки обоим классам.", closing: "Кто закончил, сверяет ответы по листу.",
      groups: [2, 4].map((grade) => ({
        grade, topic: "Тема", learningGoal: "Цель", homework: "Дома", cards: Array.from({ length: 8 }, () => card),
        stages: { review: "Повторяют", explain: "Учитель объясняет", practice: "Решают", check: "Учитель проверяет и подводит итог" },
      })),
      teacherNotes: "Заметка.",
    };
    const built = contentToLesson(content, schedule, [[], Array.from({ length: 6 }, () => card)]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.plan.rooms).toBe("separate");
    expect(built.plan.teacherNotes).toBe("Заметка.\nДо звонка раздайте карточки обоим классам.\nКто закончил, сверяет ответы по листу.");
    expect(built.plan.timeline.some((s) => s.mode === "joint" || s.activity.includes("До звонка"))).toBe(false);
  });

  it("промпт: в разных кабинетах модель знает, что общих этапов нет", () => {
    const separate = lessonInstructions("ru", ["ru"], "separate");
    expect(separate).toContain("РАЗНЫХ кабинетах");
    expect(separate).not.toContain("общее начало для всех классов");
    expect(lessonInstructions("ru")).toContain("общее начало для всех классов");
  });
});
