import { expect, it } from "vitest";
import { seededTask, TRAINER_SKILLS } from "../lib/trainer";
import { compileExpression } from "../lib/expression";
import { gradeProfile, withinProfile } from "../lib/grade-profile";

for (const skill of TRAINER_SKILLS)
  it(`${skill}: 1000 решений, повторяемость и профиль`, () => {
    const prompts = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const task = seededTask(skill, `child-${i}`, 0, "ru");
      expect(task).toEqual(seededTask(skill, `child-${i}`, 0, "ru"));
      const n = (task.prompt.match(/\d+(?:,\d+)?/g) ?? []).map((s) =>
        Number(s.replace(",", ".")),
      );
      const answer = Number(task.answer.replace(",", "."));
      const advanced = /integers|linear|decimal/.test(skill);
      const grade =
        skill === "mul_2d_1d"
          ? 3
          : /within/.test(skill)
            ? 1
            : /2d|carry|borrow|equation_add|equation_sub/.test(skill)
              ? 2
              : /3d|table|remainder/.test(skill)
                ? 3
                : 5;
      const profile = gradeProfile(
        advanced ? 6 : grade,
        undefined,
        advanced ? "Отрицательные числа и десятичные дроби" : "",
      );
      expect(n.every((value) => withinProfile(value, profile))).toBe(true);
      if (skill === "div_remainder") {
        const [q, r] = task.answer.split(/\s+/).map(Number);
        expect(q * n[1] + r).toBe(n[0]);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(n[1]);
      } else if (skill === "fraction_of")
        expect(answer).toBe((n[0] * n[2]) / n[1]);
      else if (skill === "percent_of") expect(answer).toBe((n[1] * n[0]) / 100);
      else if (skill === "round_tens")
        expect(answer).toBe(Math.round(n[0] / 10) * 10);
      else if (skill === "round_hundreds")
        expect(answer).toBe(Math.round(n[0] / 100) * 100);
      else {
        const expression = task.prompt
          .slice(task.prompt.indexOf(":") + 1)
          .trim()
          .replace(/:/g, "/");
        if (expression.includes("=")) {
          const [left, right] = expression.split("=");
          expect(compileExpression(left)?.(answer)).toBeCloseTo(
            Number(right.replace("−", "-")),
            8,
          );
        } else
          expect(compileExpression(expression)?.(0)).toBeCloseTo(answer, 8);
        expect(withinProfile(answer, profile)).toBe(true);
      }
      prompts.add(task.prompt);
    }
    expect(prompts.size).toBeGreaterThan(20);
  });
