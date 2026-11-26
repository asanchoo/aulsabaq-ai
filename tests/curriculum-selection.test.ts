import { describe, expect, it } from "vitest";
import { curriculumGoals, curriculumTopics, findProgram, resolveCurriculumGoal } from "../lib/curriculum";
import { sanitizeCurriculumGoals } from "../lib/validate";
import { demoFor } from "../lib/demo";

describe("подбор официальной программы", () => {
  it("находит деление 4 класса, сохраняет только свой класс", () => {
    const goals = curriculumGoals({ subject: "Математика", grade: 4, language: "ru", topic: "Деление на однозначное число" });
    // С 25 ноября подбор строже: лучше одна точная цель, чем несколько случайных.
    expect(goals.length).toBeGreaterThanOrEqual(1);
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

// Ошибки, найденные живым прогоном 25 ноября (TEST_LOG, проверка 23): общее слово темы находило чужие цели,
// а модель уводила урок за ними. Лучше без целей, чем с чужими.
describe("цели не уводят урок в чужую тему", () => {
  const codes = (subject: string, language: "ru" | "kk", grade: number, topic: string) =>
    curriculumGoals({ subject, language, grade, topic }).map((g) => g.code);
  const texts = (subject: string, language: "ru" | "kk", grade: number, topic: string) =>
    curriculumGoals({ subject, language, grade, topic }).map((g) => g.text).join(" ");

  it("«Күн жүйесі» не находит мочевыделительную и нервную систему", () => {
    expect(texts("Жаратылыстану", "kk", 4, "Күн жүйесі")).not.toMatch(/зәр|жүйке/u);
  });
  it("«Квадратичная функция» в 9 классе не находит единичную окружность", () => {
    expect(texts("Алгебра", "ru", 9, "Квадратичная функция")).not.toMatch(/окружност/u);
  });
  it("«Вода и её свойства» и «Круговорот воды» не находят воздух, почву и расселение людей", () => {
    expect(texts("Жаратылыстану", "kk", 3, "Су және оның қасиеттері")).not.toMatch(/ауа|топырақ|тыныс/u);
    expect(texts("Познание мира", "ru", 3, "Круговорот воды в природе")).not.toMatch(/расселени|геологическ/u);
  });
  it("«Қалдықпен бөлу» находит именно деление с остатком", () => {
    expect(codes("Математика", "kk", 3, "Қалдықпен бөлу")[0]).toBe("3.1.2.6");
  });
  it("«Етістіктің шақтары» находит цель про времена глагола и не находит наречие", () => {
    const found = texts("Қазақ тілі", "kk", 4, "Етістіктің шақтары");
    expect(found).toMatch(/шақ/u);
    expect(found).not.toMatch(/үстеу/u);
  });
  it("казахский язык с казахским обучением берёт казахский текст, а не таджикский", () => {
    expect(texts("Қазақ тілі", "kk", 2, "Зат есім")).toMatch(/зат есім/u);
    expect(texts("Қазақ тілі", "kk", 2, "Зат есім")).not.toMatch(/[Ии]см|калима/u);
  });
  it("литературное чтение 2–4 подключено к своей программе", () => {
    expect(codes("Литературное чтение", "ru", 4, "Басни И. А. Крылова")[0]?.startsWith("4.")).toBe(true);
  });
  it("не больше трёх целей", () => {
    expect(codes("Математика", "ru", 6, "Сложение отрицательных чисел").length).toBeLessThanOrEqual(3);
  });
});

// Перебор 1344 названий разделов плана 25 ноября (TEST_LOG, проверка 24): ещё три общих слова находили чужие цели.
describe("общие слова из перебора базы", () => {
  const texts = (subject: string, language: "ru" | "kk", grade: number, topic: string) =>
    curriculumGoals({ subject, language, grade, topic }).map((g) => g.text).join(" ");
  it("«Строение и свойства веществ» не находит скелет и мышцы", () => {
    expect(texts("Естествознание", "ru", 6, "Строение и свойства веществ")).not.toMatch(/скелет|мышц/u);
    expect(texts("Жаратылыстану", "kk", 6, "Заттардың құрылысы мен қасиеттері")).not.toMatch(/қаңқа|бұлшық/u);
  });
  it("«Исторические корни Казахстана» не находит права и свободы граждан", () => {
    expect(texts("Познание мира", "ru", 4, "Исторические корни Казахстана")).not.toMatch(/демократическ|свобод/u);
  });
  it("«Операции над числами» не находит монеты и купюры", () => {
    expect(texts("Математика", "ru", 3, "Операции над числами")).not.toMatch(/купюр|монет/u);
  });
});

// Проверка 24: подсказки тем в форме показывали сквозные темы и коды разделов, а «3В» попадал в название урока.
describe("подсказки тем в форме", () => {
  it("только названия разделов, без кода, без сквозных тем и подразделов", () => {
    const topics = curriculumTopics({ subject: "Математика", grade: 2, language: "ru", quarter: 3 });
    expect(topics.length).toBeGreaterThan(0);
    expect(topics).toContain("Умножение и деление. Задачи");
    for (const t of topics) {
      expect(t).not.toMatch(/^\d/u);
      expect(t).not.toMatch(/здоровом теле/u);
    }
  });
  it("на казахском тоже без кода", () => {
    const topics = curriculumTopics({ subject: "Математика", grade: 2, language: "kk", quarter: 3 });
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) expect(t).not.toMatch(/^\d/u);
  });
  it("короткие названия разделов тоже подсказываются («Доли», «Үлес»)", () => {
    expect(curriculumTopics({ subject: "Математика", grade: 3, language: "ru", quarter: 2 })).toContain("Доли");
    expect(curriculumTopics({ subject: "Математика", grade: 3, language: "kk", quarter: 2 })).toContain("Үлес");
  });
});

describe("основы слов из прогона по гипотезам", () => {
  const texts = (subject: string, language: "ru" | "kk", grade: number, topic: string) =>
    curriculumGoals({ subject, language, grade, topic }).map((g) => g.text).join(" ");
  it("«Система органов пищеварения» не находит пищевые цепи", () => {
    expect(texts("Естествознание", "ru", 4, "Система органов пищеварения")).not.toMatch(/пищев(ой|ую|ая) цеп/u);
  });
  it("«Көп таңбалы сандарды көбейту» не находит обозначение куба буквами", () => {
    expect(texts("Математика", "kk", 4, "Көп таңбалы сандарды көбейту")).not.toMatch(/текше|параллелепипед/u);
  });
});

describe("тема из одного частого слова", () => {
  it("«Пропорции» в 6 классе находит цели про пропорции", () => {
    const found = curriculumGoals({ subject: "Математика", language: "ru", grade: 6, topic: "Пропорции" }).map((g) => g.text).join(" ");
    expect(found).toMatch(/пропорц/u);
  });
});

describe("правило «все слова темы» не срабатывает, если из темы выброшено общее слово", () => {
  it("«Квадратичная функция» в 8 классе не находит квадратный корень", () => {
    const found = curriculumGoals({ subject: "Алгебра", language: "ru", grade: 8, topic: "Квадратичная функция" }).map((g) => g.text).join(" ");
    expect(found).not.toMatch(/корн/u);
  });
});
