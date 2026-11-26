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
  if (/^(литературное чтение|әдебиеттік оқу)$/u.test(subject) && grade >= 2 && grade <= 4) family = "literaturnoe-chtenie";
  if (!family) return null;
  index ??= read(join(root, "index.json")).programs as Entry[];
  const instruction = family === "russkii-yazyk" ? (language === "ru" ? "русским" : "нерусским")
    : family === "kazahskii-yazyk" ? (language === "kk" ? "казахским" : "неказахским")
    : family === "literaturnoe-chtenie" ? (language === "kk" ? "казахским" : "русским") : undefined;
  const entry = index.find((p) => p.id.startsWith(`${family}-`) && p.grades.includes(grade)
    && (instruction ? p.variant.instruction === instruction : !p.variant.instruction));
  return entry ? programById(entry.id) : null;
}

// Conservative stems join Russian cases and Kazakh suffixes without an embedding service.
const stop = new Set(["число", "числа", "чисел", "тема", "класс", "сандар", "сабақ", "және", "слово", "слова", "слове", "слову", "слов", "текст", "слова",
  "для", "при", "как", "что", "это", "или", "над", "под", "без", "мен", "бен", "пен", "оның", "его", "её", "их", "она", "они"]);
// Общие слова, которые встречаются в целях разных разделов: «система» (органов, координат, Солнечная),
// «функция» (линейная, тригонометрическая), «свойства», «природа». По ним одним тема не определяется:
// «Күн жүйесі» иначе находит «зәр шығару жүйесі», а «Квадратичная функция» находит единичную окружность.
const generic = new Set(["систе", "жүйе", "жүйес", "функц", "свойс", "қасие", "приро", "табиғ", "понят", "ұғым", "ұғымы",
  "основ", "негіз", "прави", "ереже", "виды", "түрле", "особе", "ерекш", "значе", "мағын", "измен", "өзгер", "решен",
  "шешу", "задач", "есеп", "есепт", "приме", "мысал", "урок", "общий", "жалпы",
  // «Строение и свойства веществ» иначе находит строение скелета, «Операции над числами» находит «числовые головоломки»
  "строе", "құрыл", "число", "числу", "числе", "опера", "амалд", "казах", "қазақ",
  // «көп таңбалы» (многозначный) и «таңбалау» (обозначать) иначе совпадают
  "таңба"]);
/** Основа слова: 5 букв, а у длинных русских слов 6, чтобы «пищеварение» и «пищевой» (обе «пищев») не совпадали.
 * Казахские слова меняют окончания сильнее («шақтары», «шақта»), им оставляем 5 букв. */
const stem = (w: string) => w.length >= 7 && !/[әғқңөұүһі]/u.test(w) ? w.slice(0, 6) : w.slice(0, 5);
function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? [])
    .filter((w) => !stop.has(w) && !generic.has(w.slice(0, 5)) && !generic.has(w.slice(0, 4)) && !generic.has(w))
    .map(stem));
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

/** Rank only the requested grade/quarter. No lexical evidence means no claimed alignment. */
export function curriculumGoals(query: CurriculumQuery): CurriculumGoal[] {
  const program = findProgram(query);
  const topic = words(query.topic ?? "");
  // Были ли в теме общие слова («функция», «система»): тогда по одному оставшемуся слову тему не узнать,
  // и правило «в цели есть все слова темы» не действует («Квадратичная функция» иначе находит квадратный корень).
  const droppedGeneric = (query.topic ?? "").toLowerCase().match(/[\p{L}]{3,}/gu)
    ?.some((w) => !stop.has(w) && (generic.has(w.slice(0, 5)) || generic.has(w.slice(0, 4)) || generic.has(w))) ?? false;
  if (!program || !topic.size) return [];
  const rows = (program.plan[String(query.grade)] ?? []).filter((r) => !query.quarter || r.quarter === query.quarter);
  const allowed = query.quarter ? new Set(rows.flatMap((r) => r.goals)) : null;
  const candidates = Object.entries(program.goals).filter(([code, goal]) => goal.grade === query.grade
    && code.startsWith(`${query.grade}.`) && (!allowed || allowed.has(code)))
    .map(([code, goal]) => ({ code, goal, stems: words(`${goal.ru} ${goal.kk ?? ""}`) }));
  // Вес слова темы: чем в меньшем числе целей класса оно встречается, тем точнее указывает на цель.
  // «Қалдықпен бөлу»: «қалдық» есть в одной цели и решает, «бөлу» есть в десятке целей и почти не весит.
  const weight = new Map([...topic].map((w) => [w, 1 / Math.sqrt(Math.max(1, candidates.filter((c) => c.stems.has(w)).length))]));
  const ranked = candidates.map(({ code, goal, stems }) => {
      const direct = [...topic].filter((w) => stems.has(w)).reduce((sum, w) => sum + (weight.get(w) ?? 0), 0);
      const section = Math.max(0, ...rows.filter((r) => r.goals.includes(code))
        .map((r) => overlap(topic, words([...r.ru, ...(r.kk ?? [])].join(" ")))));
      const covered = [...topic].every((w) => stems.has(w));
      return { code, goal, direct, covered, score: direct * 4 + section * 0.5 };
    })
    // Цель берём, только если сама её формулировка содержит слово темы: совпадение лишь с названием
    // раздела плана («Все обо мне», «Мой родной край») не говорит, что цель про эту тему.
    // Одно частое слово (есть в десятке целей класса, например «Казахстан» или «деление») цель не даёт:
    // вес такого слова меньше 0,34. Нужно редкое слово темы или два частых.
    // Исключение: в цели есть все слова темы («Пропорции» → «знать определение пропорции»), даже если слово частое.
    .filter((x) => x.direct >= 0.34 || (x.covered && !droppedGeneric)).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  const best = ranked[0]?.score ?? 0;
  // Слабые совпадения рядом с сильным обычно случайные: оставляем цели не слабее половины лучшей, не больше трёх.
  return ranked.filter((x) => x.score * 2 >= best).slice(0, 3)
    .map(({ code, goal }) => ({ code, programId: program.id, text: goal[query.language] || goal.ru }));
}

/** Suggestions are small server responses, not an import of the whole programme into the form. */
export function curriculumTopics(query: CurriculumQuery): string[] {
  const program = findProgram(query);
  if (!program || !query.quarter) return [];
  const rows = (program.plan[String(query.grade)] ?? []).filter((r) => r.quarter === query.quarter);
  const labels = rows.flatMap((r) => query.language === "kk" ? r.kk ?? [] : r.ru);
  // В плане рядом стоят сквозные темы («1. Все обо мне 2. Моя школа»), разделы («3В Умножение и деление»)
  // и подразделы программы («3.1 Геометрические фигуры»). Темой урока подходит раздел, и без кода «3В»:
  // иначе код попадёт в название урока и на слайды.
  const unit = /^\d\s?[A-ZА-ЯӘ]\s+(.+)$/u;
  const units = labels.map((s) => s.match(unit)?.[1]?.trim()).filter((s): s is string => !!s);
  const subsections = labels.map((s) => s.match(/^\d{1,2}\.\d{1,2}\.?\s+(.+)$/u)?.[1]?.trim()).filter((s): s is string => !!s);
  // Короткие разделы бывают настоящими темами («Доли», «Үлес», «Су», «Жер»), поэтому нижний порог 2 буквы.
  return [...new Set(units.length ? units : subsections)].filter((s) => s.length >= 2 && s.length <= 120).slice(0, 12);
}

/** Re-read the trusted text and grade; forged codes or another programme never survive. */
export function resolveCurriculumGoal(goal: CurriculumGoal, grade: number, language: Lang): CurriculumGoal | null {
  const program = programById(goal.programId);
  const trusted = program?.goals[goal.code];
  return trusted?.grade === grade && goal.code.startsWith(`${grade}.`)
    ? { code: goal.code, programId: goal.programId, text: trusted[language] || trusted.ru } : null;
}
