import { describe, expect, it, vi } from "vitest";
import { reviewRules } from "@/lib/ai";
import { demoLesson } from "@/lib/demo";
import type { Provider } from "@/lib/providers";
import { isLanguageSubject, ruleSuspects, type RulesReview } from "@/lib/rules";

describe("правила языка: что код узнаёт сам", () => {
  it("уроки по языкам и литературе, но не математика", () => {
    for (const s of ["Русский язык", "Қазақ тілі", "Орыс тілі", "Литературное чтение", "Ана тілі"]) expect(isLanguageSubject(s), s).toBe(true);
    for (const s of ["Математика", "Алгебра", "Познание мира"]) expect(isLanguageSubject(s), s).toBe(false);
  });

  it("находки аудита 19 ноября: чередование и словарные слова выданы за проверяемые", () => {
    expect(ruleSuspects("Вставь букву: з_ря. Проверочное слово: зори.").join(" ")).toContain("чередованием");
    expect(ruleSuspects("к_ртофель, проверочное слово картошка").join(" ")).toContain("словарное");
    expect(ruleSuspects("Морковь, корзина: проверочные слова морковка, корзинка").join(" ")).toContain("«Морковь»");
  });

  it("исправление рецензента со словарным словом отбрасывается (проверка 19 ноября: «сторож» → «дорога»)", async () => {
    const { introducesSuspects } = await import("@/lib/rules");
    expect(introducesSuspects("ст_рожить — сторож", "д_рога — дороги")).toBe(true);
    expect(introducesSuspects("к_ртофель — картошка", "тр_ва — травы")).toBe(false);
  });

  it("проверяемые слова и словарные слова без проверки не подозрительны", () => {
    expect(ruleSuspects("Вставь букву: в_да, проверочное слово воды")).toEqual([]);
    expect(ruleSuspects("Корова пасётся на лугу. Найди подлежащее.")).toEqual([]);
  });
});

describe("правила языка: рецензент и код", () => {
  const plan = structuredClone(demoLesson);
  const g = plan.groups[0];
  const closed = g.cards.find((c) => c.type === "closed")!;
  const provider = (review: RulesReview | null): Provider => ({ name: "openai", call: vi.fn(async () => (review ? JSON.stringify(review) : null)) });
  const empty: RulesReview = { cards: [], examples: [], practice: [], mistakes: [], keyIdea: null };

  it("верное исправление карточки применяется, и запрос идёт с размышлением medium", async () => {
    const fix = { id: closed.id, problem: "пример", prompt: `${closed.prompt} (исправлено)`, answer: closed.answer ?? null, accept: [], inputHint: null, hint: closed.hint };
    const p = provider({ ...empty, cards: [fix] });
    const result = await reviewRules(p, plan, Date.now());
    expect(result.groups[0].cards.find((c) => c.id === closed.id)?.prompt).toBe(fix.prompt);
    expect(vi.mocked(p.call).mock.calls[0][0]).toMatchObject({ reasoning: "medium", schemaName: "rules_review" });
  });

  it("исправление, которое ломает проверки (подсказка с ответом), не применяется", async () => {
    const answer = closed.answer ?? "12";
    const fix = { id: closed.id, problem: "пример", prompt: "Новое задание", answer, accept: [], inputHint: null, hint: `Ответ: ${answer}` };
    const result = await reviewRules(provider({ ...empty, cards: [fix] }), plan, Date.now());
    expect(result.groups[0].cards.find((c) => c.id === closed.id)).toEqual(closed);
  });

  it("пример с новым условием теряет старый наглядный блок; сбой рецензента оставляет урок как был", async () => {
    const e = g.explanation;
    const fix = { index: 0, problem: "пример", task: "Новое условие примера", steps: ["Шаг один", "Шаг два"], answer: e.example.answer };
    const result = await reviewRules(provider({ ...empty, examples: [fix] }), plan, Date.now());
    expect(result.groups[0].explanation.example).toMatchObject({ problem: "Новое условие примера", visual: null });
    expect(await reviewRules(provider(null), plan, Date.now())).toEqual(plan);
  });
});

describe("рецензент правил проверяет и типичные ошибки (серия 19 ноября: «дуб — дубок»)", () => {
  it("исправленная ошибка заменяет неверную, ошибка со словарным словом не применяется", async () => {
    const plan = structuredClone(demoLesson);
    const provider = (mistakes: RulesReview["mistakes"]): Provider => ({ name: "openai", call: vi.fn(async () => JSON.stringify({ cards: [], examples: [], practice: [], mistakes, keyIdea: null })) });
    const fixed = await reviewRules(provider([{ index: 0, problem: "неверное объяснение", text: "Ученик сложил 27 и 16 и получил 313. Он не перенёс десяток." }]), plan, Date.now());
    expect(fixed.groups[0].explanation.mistakes[0]).toBe("Ученик сложил 27 и 16 и получил 313. Он не перенёс десяток.");
    const kept = await reviewRules(provider([{ index: 0, problem: "x", text: "Ученик написал к_ртофель с буквой а. Проверочное слово картошка." }]), plan, Date.now());
    expect(kept.groups[0].explanation.mistakes[0]).toBe(plan.groups[0].explanation.mistakes[0]);
  });
});
