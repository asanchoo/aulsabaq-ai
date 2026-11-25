// Node fs keeps the catalogue on the server; no curriculum JSON enters a client import graph.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CurriculumGoal, Lang } from "./schema";

type Entry = { id: string; subject: { ru: string; kk?: string }; grades: number[]; variant: { instruction?: string } };
type Goal = { grade: number; ru: string; kk?: string };
type Row = { quarter: number | null; ru: string[]; kk?: string[]; goals: string[] };
type Program = Entry & { goals: Record<string, Goal>; plan: Record<string, Row[]> };
export type CurriculumQuery = { subject: string; grade: number; language: Lang; topic?: string; quarter?: number };
const root = join(process.cwd(), "data", "curriculum");
let index: Entry[] | undefined;
const cache = new Map<string, Program>();
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** Only indexed filenames can reach fs, so form values cannot choose a filesystem path. */
function programById(id: string): Program | null {
  index ??= read(join(root, "index.json")).programs as Entry[];
  if (!index.some((p) => p.id === id)) return null;
  if (!cache.has(id)) cache.set(id, read(join(root, "programs", `${id}.json`)) as Program);
  return cache.get(id)!;
}

/** Language subjects use the instruction variant; other subjects share the bilingual programme. */
export function findProgram(query: CurriculumQuery): Program | null {
  const { grade, language } = query;
  const subject = query.subject.toLocaleLowerCase().trim();
  let family: string | undefined;
  if (/^(математика|math)$/u.test(subject) && grade <= 6) family = "matematika";
  if (/^(алгебра|algebra)$/u.test(subject) && grade >= 7 && grade <= 9) family = "algebra";
  if (/^(геометрия|geometry)$/u.test(subject) && grade >= 7 && grade <= 9) family = "geometriya";
  if (/^(естествознание|жаратылыстану)$/u.test(subject) && grade <= 6) family = "estestvoznanie";
  if (/^(познание мира|дүниетану)$/u.test(subject) && grade <= 6) family = "poznanie-mira";
  if (/^(русский язык|орыс тілі)$/u.test(subject) && grade <= 9) family = "russkii-yazyk";
  if (/^(казахский язык|қазақ тілі)$/u.test(subject) && grade <= 9) family = "kazahskii-yazyk";
  if (!family) return null;
  index ??= read(join(root, "index.json")).programs as Entry[];
  const instruction = family === "russkii-yazyk" ? (language === "ru" ? "русским" : "нерусским")
    : family === "kazahskii-yazyk" ? (language === "kk" ? "казахским" : "неказахским") : undefined;
  const entry = index.find((p) => p.id.startsWith(`${family}-`) && p.grades.includes(grade)
    && (instruction ? p.variant.instruction === instruction : !p.variant.instruction));
  return entry ? programById(entry.id) : null;
}

// Conservative stems join Russian cases and Kazakh suffixes without an embedding service.
const stop = new Set(["число", "числа", "чисел", "тема", "класс", "сандар", "сабақ", "және", "слово", "слова", "слове", "слову", "слов", "текст", "слова"]);
function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? [])
    .filter((w) => !stop.has(w)).map((w) => w.length > 5 ? w.slice(0, 5) : w));
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

/** Rank only the requested grade/quarter. No lexical evidence means no claimed alignment. */
export function curriculumGoals(query: CurriculumQuery): CurriculumGoal[] {
  const program = findProgram(query);
  const topic = words(query.topic ?? "");
  if (!program || !topic.size) return [];
  const rows = (program.plan[String(query.grade)] ?? []).filter((r) => !query.quarter || r.quarter === query.quarter);
  const allowed = query.quarter ? new Set(rows.flatMap((r) => r.goals)) : null;
  return Object.entries(program.goals).filter(([code, goal]) => goal.grade === query.grade
    && code.startsWith(`${query.grade}.`) && (!allowed || allowed.has(code)))
    .map(([code, goal]) => {
      const direct = overlap(topic, words(`${goal.ru} ${goal.kk ?? ""}`));
      const section = Math.max(0, ...rows.filter((r) => r.goals.includes(code))
        .map((r) => overlap(topic, words([...r.ru, ...(r.kk ?? [])].join(" ")))));
      return { code, goal, score: direct * 4 + section };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, 5).map(({ code, goal }) => ({ code, programId: program.id, text: goal[query.language] || goal.ru }));
}

/** Suggestions are small server responses, not an import of the whole programme into the form. */
export function curriculumTopics(query: CurriculumQuery): string[] {
  const program = findProgram(query);
  if (!program || !query.quarter) return [];
  const rows = (program.plan[String(query.grade)] ?? []).filter((r) => r.quarter === query.quarter);
  return [...new Set(rows.flatMap((r) => query.language === "kk"
    ? r.kk ?? r.goals.map((code) => program.goals[code]?.kk).filter((s): s is string => !!s)
    : r.ru))].filter((s) => s.length >= 5 && s.length <= 300).slice(0, 12);
}

/** Re-read the trusted text and grade; forged codes or another programme never survive. */
export function resolveCurriculumGoal(goal: CurriculumGoal, grade: number, language: Lang): CurriculumGoal | null {
  const program = programById(goal.programId);
  const trusted = program?.goals[goal.code];
  return trusted?.grade === grade && goal.code.startsWith(`${grade}.`)
    ? { code: goal.code, programId: goal.programId, text: trusted[language] || trusted.ru } : null;
}
