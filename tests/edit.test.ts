import { describe, expect, it } from "vitest";
import { demoLesson } from "@/lib/demo";
import { applyEdit, LessonEditSchema, toEdit } from "@/lib/edit";
import { validateLessonPlan } from "@/lib/validate";

const fresh = () => structuredClone(demoLesson);

describe("правка урока учителем", () => {
  it("правка текста сохраняется, расписание не меняется", () => {
    const plan = fresh();
    const edit = toEdit(plan);
    edit.groups[0].cards[0].prompt = "Вычисли: 50 + 25";
    edit.groups[0].cards[0].answer = plan.groups[0].cards[0].type === "closed" ? "75" : "";
    edit.groups[1].homework = "Реши три примера на деление.";
    expect(LessonEditSchema.safeParse(edit).success).toBe(true);
    const result = applyEdit(plan, edit);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.groups[0].cards[0].prompt).toBe("Вычисли: 50 + 25");
    expect(result.plan.groups[1].homework).toBe("Реши три примера на деление.");
    expect(result.plan.timeline).toEqual(plan.timeline);
    expect(validateLessonPlan(result.plan)).toEqual({ ok: true });
  });

  it("не даёт сохранить закрытую карточку без ответа и подсказку с ответом", () => {
    const plan = fresh();
    const edit = toEdit(plan);
    const ci = plan.groups[0].cards.findIndex((c) => c.type === "closed");
    edit.groups[0].cards[ci].answer = "";
    let result = applyEdit(plan, edit);
    expect(result).toMatchObject({ ok: false, issues: [{ code: "closed_answer", cardId: plan.groups[0].cards[ci].id }] });

    const edit2 = toEdit(plan);
    edit2.groups[0].cards[ci].hint = `Подумай, получится ли ${plan.groups[0].cards[ci].answer}`;
    result = applyEdit(plan, edit2);
    expect(result).toMatchObject({ ok: false, issues: [{ code: "hint_answer" }] });
  });

  it("неверное равенство сохраняется, но с предупреждением", () => {
    const plan = fresh();
    const edit = toEdit(plan);
    edit.groups[0].explanation.keyIdea = "Например, 7 + 5 = 13.";
    const result = applyEdit(plan, edit);
    expect(result).toMatchObject({ ok: true, warnings: [{ code: "arithmetic", detail: "7 + 5 = 13" }] });
  });

  it("отказывает, если карточки переставили или подменили id", () => {
    const plan = fresh();
    const edit = toEdit(plan);
    edit.groups[0].cards.reverse();
    expect(applyEdit(plan, edit)).toEqual({ ok: false, issues: [{ code: "structure" }] });
  });
});
