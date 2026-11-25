import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// База типовых программ (приказ № 399) собирается scripts/curriculum/build.py.
// Тест ловит поломку сборки: потерянные цели, коды не своего класса, план без четвертей.

type Goal = { grade: number; ru: string; kk?: string; section?: string; subsection?: string };
type PlanRow = { quarter: number | null; ru: string[]; kk?: string[]; goals: string[] };
type Program = { id: string; grades: number[]; goals: Record<string, Goal>; plan: Record<string, PlanRow[]> };

const dir = join(process.cwd(), "data", "curriculum");
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as { programs: { id: string; goals: number }[] };
const load = (id: string): Program => JSON.parse(readFileSync(join(dir, "programs", `${id}.json`), "utf8"));

describe("база типовых программ", () => {
  it("в индексе все 128 программ приказа, и у каждой есть файл", () => {
    const files = readdirSync(join(dir, "programs"));
    expect(index.programs).toHaveLength(128);
    for (const p of index.programs) expect(files).toContain(`${p.id}.json`);
  });

  it("всего больше 11 000 целей", () => {
    expect(index.programs.reduce((sum, p) => sum + p.goals, 0)).toBeGreaterThan(11000);
  });

  it("математика 1–4: 244 цели, у каждой текст на русском и казахском", () => {
    const math = load("matematika-1-4");
    const goals = Object.entries(math.goals);
    expect(goals).toHaveLength(244);
    for (const [, g] of goals) {
      expect(g.ru.length).toBeGreaterThan(3);
      expect(g.kk?.length ?? 0).toBeGreaterThan(3);
    }
    expect(math.goals["2.1.1.2"].ru).toBe("читать, записывать и сравнивать двузначные числа");
    expect(math.goals["2.1.1.2"].subsection).toBe("Натуральные числа и число 0. Дроби");
  });

  it("математика 1–4: у каждого класса план на все четыре четверти", () => {
    const math = load("matematika-1-4");
    for (const grade of ["1", "2", "3", "4"]) {
      const quarters = new Set(math.plan[grade].map((r) => r.quarter));
      expect([...quarters].sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it("код цели начинается с класса, который есть в программе", () => {
    for (const { id } of index.programs) {
      const p = load(id);
      for (const [code, g] of Object.entries(p.goals)) {
        expect(Number(code.split(".")[0]), `${id} ${code}`).toBe(g.grade);
        expect(p.grades, `${id} ${code}`).toContain(g.grade);
      }
    }
  });

  it("в плане только цели, которые есть в программе", () => {
    for (const { id } of index.programs) {
      const p = load(id);
      for (const rows of Object.values(p.plan)) {
        for (const row of rows) for (const code of row.goals) expect(p.goals, `${id} ${code}`).toHaveProperty([code]);
      }
    }
  });
});
