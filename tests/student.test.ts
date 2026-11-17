import { describe, expect, it } from "vitest";
import { demoLesson } from "@/lib/demo";
import { applyAction, cleanName, emptyState, isStruggling, readProgress, REVEAL_AFTER, studentCards } from "@/lib/student";
import type { TaskCard } from "@/lib/schema";

const closed: TaskCard = { id: "g1-c1", type: "closed", prompt: "Вычисли: 36 + 48", answer: "84", successCriteria: "Ответ 84", hint: "Сложи десятки", difficulty: 1, purpose: "practice" };
const open: TaskCard = { ...closed, id: "g1-c2", type: "open", answer: undefined };

describe("режим ученика: правила карточки", () => {
  it("верный ответ решает карточку, неверный считает попытку", () => {
    const wrong = applyAction(closed, undefined, { action: "answer", cardId: closed.id, answer: "74" });
    expect(wrong).toMatchObject({ ok: true, correct: false, state: { status: "todo", attempts: 1, lastAnswer: "74" } });
    const right = applyAction(closed, wrong.ok ? wrong.state : undefined, { action: "answer", cardId: closed.id, answer: "84" });
    expect(right).toMatchObject({ ok: true, correct: true, state: { status: "correct", attempts: 2 } });
  });

  it("решённую карточку нельзя решать заново", () => {
    expect(applyAction(closed, { ...emptyState(), status: "correct" }, { action: "answer", cardId: closed.id, answer: "84" })).toEqual({ ok: false, error: "finished" });
  });

  it("сверить с ответом можно только после двух попыток, и потом только отметить себя", () => {
    const one = { ...emptyState(), attempts: REVEAL_AFTER - 1 };
    expect(applyAction(closed, one, { action: "reveal", cardId: closed.id })).toEqual({ ok: false, error: "too_early" });
    const revealed = applyAction(closed, { ...one, attempts: REVEAL_AFTER }, { action: "reveal", cardId: closed.id });
    expect(revealed).toMatchObject({ ok: true, state: { revealed: true } });
    const state = revealed.ok ? revealed.state : emptyState();
    expect(applyAction(closed, state, { action: "answer", cardId: closed.id, answer: "84" })).toEqual({ ok: false, error: "finished" });
    expect(applyAction(closed, state, { action: "self", cardId: closed.id, correct: false })).toMatchObject({ ok: true, state: { status: "self_wrong" } });
  });

  it("открытое задание отмечается выполненным, а ответ на него не принимается", () => {
    expect(applyAction(open, undefined, { action: "done", cardId: open.id })).toMatchObject({ ok: true, state: { status: "done" } });
    expect(applyAction(open, undefined, { action: "answer", cardId: open.id, answer: "что-то" })).toEqual({ ok: false, error: "not_closed" });
    expect(applyAction(closed, undefined, { action: "done", cardId: closed.id })).toEqual({ ok: false, error: "not_open" });
  });

  it("ученик не видит эталон и подсказку, пока не сверяет ответ", () => {
    const group = demoLesson.groups[0];
    const cards = studentCards(group, {});
    expect(cards).toHaveLength(group.cards.length);
    for (const card of cards) {
      expect(card).not.toHaveProperty("answer");
      expect(card).not.toHaveProperty("hint");
    }
    const closedCard = group.cards.find((c) => c.type === "closed")!;
    const revealed = studentCards(group, { [closedCard.id]: { ...emptyState(), revealed: true } });
    expect(revealed.find((c) => c.id === closedCard.id)?.answer).toBe(closedCard.answer);
  });

  it("битый прогресс из базы превращается в «ещё не начинал»", () => {
    expect(readProgress({ "g1-c1": { status: "взлом", attempts: -5 }, "g1-c2": null })).toEqual({
      "g1-c1": emptyState(),
      "g1-c2": emptyState(),
    });
    expect(readProgress("мусор")).toEqual({});
  });

  it("трудно: две неверные попытки, две подсказки или признанная ошибка", () => {
    expect(isStruggling({ ...emptyState(), attempts: 2 })).toBe(true);
    expect(isStruggling({ ...emptyState(), attempts: 2, status: "correct" })).toBe(false);
    expect(isStruggling({ ...emptyState(), hints: 2 })).toBe(true);
    expect(isStruggling({ ...emptyState(), status: "self_wrong" })).toBe(true);
    expect(isStruggling(undefined)).toBe(false);
  });

  it("имя ученика: без почты, телефона и лишних знаков", () => {
    expect(cleanName("  Даша  ")).toBe("Даша");
    expect(cleanName("7")).toBe("7");
    expect(cleanName("dasha@mail.kz")).toBe("dashamail.kz");
    expect(cleanName("<script>")).toBe("script");
    expect(cleanName("!!!")).toBeNull();
    expect(cleanName("А".repeat(60))).toHaveLength(40);
  });
});
