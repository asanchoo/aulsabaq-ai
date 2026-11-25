import { describe, expect, it } from "vitest";
import { curriculumGoals, curriculumTopics, findProgram, resolveCurriculumGoal } from "../lib/curriculum";
import { sanitizeCurriculumGoals } from "../lib/validate";
import { demoFor } from "../lib/demo";

describe("подбор официальной программы", () => {
  it("находит деление 4 класса, сохраняет только свой класс", () => {
    const goals = curriculumGoals({ subject: "Математика", grade: 4, language: "ru", topic: "Деление на однозначное число" });
    expect(goals.length).toBeGreaterThanOrEqual(2);
    expect(goals.some((g) => g.text.includes("однозначное"))).toBe(true);
    expect(goals.every((g) => g.code.startsWith("4."))).toBe(true);
  });
  it("не заявляет соответствие чужой теме или неизвестному предмету", () => {
    expect(curriculumGoals({ subject: "Математика", grade: 4, language: "ru", topic: "Астронавигация галактик" })).toEqual([]);
    expect(findProgram({ subject: "../../etc/passwd", grade: 4, language: "ru" })).toBeNull();
    expect(findProgram({ subject: "Познание мира", grade: 6, language: "ru" })).toBeNull();
  });
  it("учитывает язык обучения и четверть", () => {
    expect(findProgram({ subject: "Русский язык", grade: 3, language: "kk" })?.variant.instruction).toBe("нерусским");
    expect(findProgram({ subject: "Қазақ тілі", grade: 5, language: "kk" })?.variant.instruction).toBe("казахским");
    expect(curriculumTopics({ subject: "Математика", grade: 2, language: "ru", quarter: 1 }).length).toBeGreaterThan(0);
    const q = { subject: "Математика", grade: 4, language: "ru" as const, quarter: 1, topic: "Деление" };
    const p = findProgram(q)!;
    const allowed = p.plan["4"].filter((r) => r.quarter === 1).flatMap((r) => r.goals);
    expect(curriculumGoals(q).every((g) => allowed.includes(g.code))).toBe(true);
  });
  it("мягко убирает поддельный код и код другого класса, восстанавливает текст", () => {
    const plan = structuredClone(demoFor("ru"));
    const goal = curriculumGoals({ subject: plan.subject, grade: 2, language: "ru", topic: plan.groups[0].topic })[0];
    expect(goal).toBeDefined();
    plan.groups[0].curriculumGoals = [{ ...goal, text: "подмена" }, { ...goal, code: "4.1.2.7" }, { ...goal, code: "2.99.99" }];
    const safe = sanitizeCurriculumGoals(plan, resolveCurriculumGoal);
    expect(safe.groups[0].curriculumGoals).toEqual([goal]);
  });
  it("цели обоих демо существуют в каталоге и соответствуют классу", () => {
    for (const lang of ["ru", "kk"] as const) for (const group of demoFor(lang).groups) {
      expect(group.curriculumGoals?.length).toBeGreaterThanOrEqual(2);
      for (const goal of group.curriculumGoals ?? []) expect(resolveCurriculumGoal(goal, group.grade, lang)).toEqual(goal);
    }
  });
});
