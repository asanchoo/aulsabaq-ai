import { z } from "zod";
import { groupLanguage, type Explanation, type LessonPlan, type TaskCard } from "./schema";

/**
 * Проверка правил в уроках по языкам.
 *
 * Аудит 19 ноября нашёл в одном уроке русского языка для 3 класса пять неверных утверждений о правилах:
 * «з_ря, проверочное слово зори» (корень с чередованием), «картофель» и «морковь» как проверяемые ударением
 * (это словарные слова), «письмо́» с якобы ударной «и». Арифметику пересчитывает код, а правила языка код
 * проверить не может. Поэтому после сборки урока по языку модель отдельным запросом, с более глубоким
 * размышлением, ищет только ошибки в правилах и возвращает исправленные элементы. Код подсказывает ей места,
 * которые узнаёт сам: словарные слова и слова с чередованием рядом со словом «проверочное», и применяет
 * исправление, только если исправленный элемент проходит все прежние проверки (lib/ai.ts).
 */

/** Урок по языку или литературе: русский, казахский, «Ана тілі», «Литературное чтение». */
export function isLanguageSubject(subject: string): boolean {
  return /русск|орыс|казах|қазақ|язык|тіл|грамматик|литератур|әдебиет|чтени|оқу|сауат|букварь|әліппе/i.test(subject);
}

/**
 * Словарные слова 1–4 класса: безударную гласную в них не проверить ударением, их запоминают.
 * Не полный словарь, а слова, которые чаще всего попадают в задания «проверь ударением».
 */
const DICTIONARY_WORDS = [
  "берёза", "ворона", "воробей", "корова", "собака", "сорока", "лисица", "медведь", "петух", "заяц", "молоко",
  "морковь", "капуста", "картофель", "огурец", "помидор", "малина", "земляника", "клубника", "ягода", "яблоко",
  "овощи", "огород", "карандаш", "тетрадь", "пенал", "ученик", "учитель", "класс", "пальто", "одежда", "сапоги",
  "платок", "костюм", "обед", "ужин", "завтрак", "посуда", "тарелка", "стакан", "народ", "работа", "лопата",
  "топор", "город", "деревня", "улица", "магазин", "мороз", "погода", "ветер", "девочка", "мальчик", "ребята",
  "хорошо", "быстро", "весело", "вдруг", "вокруг", "сначала", "сегодня", "вчера", "завтра", "спасибо",
  "пожалуйста", "здравствуй", "отец", "корабль", "комната", "кровать", "жёлтый", "красный", "коньки", "лагерь",
  "ракета", "хоккей", "футбол", "аллея", "багаж", "библиотека", "билет", "вагон", "вокзал", "газета", "горизонт",
  "дорога", "животное", "инженер", "каникулы", "квартира", "километр", "коллекция", "комбайн", "корзина",
  "космонавт", "лестница", "металл", "метро", "океан", "пассажир", "пейзаж", "пирог", "праздник", "прекрасный",
  "путешествие", "салют", "сирень", "солдат", "солома", "телефон", "трактор", "трамвай", "фамилия", "хозяин",
  "шоссе", "экскурсия", "январь", "февраль", "апрель", "октябрь", "ноябрь", "декабрь", "понедельник", "суббота",
  "воскресенье", "ладонь", "пятница", "посёлок", "русский", "родина", "товарищ", "машина", "лимон", "апельсин",
  "калина", "осина", "рябина", "сосна", "ежевика", "кастрюля", "стакан", "песок", "мебель", "котёнок",
];

/** Слова с чередованием в корне (зар/зор, гар/гор, раст/рос, лаг/лож, бер/бир, мер/мир…): ударением не проверяют. */
const ALTERNATING_ROOT_WORDS = [
  "заря", "зори", "зорька", "зарница", "озарить", "загар", "загорать", "гореть", "горелка", "растение", "растёт",
  "расти", "росток", "вырасти", "выросла", "предложение", "положить", "предлагать", "слагаемое", "собирать",
  "соберу", "собрать", "умирать", "замереть", "замирать", "вытирать", "стереть", "блестеть", "блистать",
  "касаться", "коснуться", "равнина", "поровну", "плавать", "поплавок", "плавник", "пловец", "умакнуть",
  "вымокнуть", "выбирать", "выберу", "запирать", "запереть", "сочетание", "вычитать", "вычесть",
];

const VOWELS = "аоеиыяюэу";

function wordList(words: string[]) {
  return new Set(words.map((w) => w.toLowerCase().replace(/ё/g, "е")));
}
const dictionary = wordList(DICTIONARY_WORDS);
const alternating = wordList(ALTERNATING_ROOT_WORDS);

/** Чем подозрительно слово: «словарное слово» или «корень с чередованием»; null, если ничем. */
function kindOf(word: string): string | null {
  const w = word.toLowerCase().replace(/ё/g, "е").replace(/[́]/g, "");
  if (alternating.has(w)) return "корень с чередованием, ударением не проверяется";
  if (dictionary.has(w)) return "словарное слово, ударением не проверяется";
  return null;
}

/**
 * Слова, которые выдают за проверяемые ударением, хотя это словарное слово или корень с чередованием.
 * Ищем слова с пропуском («к_ртофель», «з..ря»): подставляем гласные на место пропуска. Целые слова берём,
 * только если в тексте говорится о проверке («проверочное слово морковка»), иначе «корова» в задаче про
 * подлежащее стала бы подозрительной.
 */
export function ruleSuspects(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/[\p{L}́]*(?:_+|\.{2,}|…)[\p{L}́]*/gu)) {
    const [before, after] = m[0].split(/_+|\.{2,}|…/);
    if (!before && !after) continue;
    for (const v of VOWELS) {
      const why = kindOf(`${before}${v}${after}`);
      if (why) {
        found.add(`«${m[0]}» (${before}${v}${after}): ${why}`);
        break;
      }
    }
  }
  if (/провер|тексер/i.test(text)) {
    for (const m of text.matchAll(/[\p{L}́]{4,}/gu)) {
      const why = kindOf(m[0]);
      if (why) found.add(`«${m[0]}»: ${why}`);
    }
  }
  return [...found];
}

/**
 * Исправление приносит новое подозрительное слово. Рецензент тоже ошибается: в проверке 19 ноября он счёл
 * верную пару «сторожить — сторож» ошибкой и заменил её словарным словом «дорога». Такое исправление
 * не применяем, остаётся прежний текст.
 */
export function introducesSuspects(before: string, after: string): boolean {
  const old = new Set(ruleSuspects(before));
  return ruleSuspects(after).some((s) => !old.has(s));
}

// ---------------------------------------------------------------------------
// Запрос к модели и применение исправлений

/** Что рецензент возвращает: только элементы с ошибкой, каждый исправленный целиком. */
export const RulesReviewSchema = z.object({
  cards: z.array(z.object({
    id: z.string(),
    problem: z.string(),
    prompt: z.string().min(1),
    answer: z.string().nullable(),
    accept: z.array(z.string()),
    inputHint: z.string().nullable(),
    hint: z.string().min(1),
  })),
  examples: z.array(z.object({
    index: z.number().int(),
    problem: z.string(),
    task: z.string().min(1),
    steps: z.array(z.string().min(1)),
    answer: z.string().min(1),
  })),
  practice: z.array(z.object({ index: z.number().int(), problem: z.string(), task: z.string().min(1), answer: z.string().min(1) })),
  /** Типичные ошибки учеников: их класс видит на слайде «Найди ошибку», объяснение в них должно быть верным. */
  mistakes: z.array(z.object({ index: z.number().int(), problem: z.string(), text: z.string().min(1) })),
  keyIdea: z.string().nullable(),
});
export type RulesReview = z.infer<typeof RulesReviewSchema>;

/** Что уходит рецензенту по одному классу: правило, примеры, задания и подозрения кода. */
export function rulesRequest(plan: LessonPlan, groupIndex: number) {
  const g = plan.groups[groupIndex];
  const e = g.explanation;
  const examples = [e.example, ...e.examples].map((x, index) => ({ index, task: x.problem, steps: x.steps, answer: x.answer }));
  const practice = e.practice.map((p, index) => ({ index, task: p.task, answer: p.answer }));
  // Запас проверяем вместе с основными карточками: ученик решает его так же сам, без учителя.
  const cards = [...g.cards, ...(g.extraCards ?? [])].map((c) => ({ id: c.id, type: c.type, prompt: c.prompt, answer: c.answer ?? null, accept: c.accept ?? [], inputHint: c.inputHint ?? null, hint: c.hint }));
  const suspects = [
    ...examples.flatMap((x) => ruleSuspects([x.task, ...x.steps, x.answer].join("\n")).map((s) => `пример ${x.index}: ${s}`)),
    ...practice.flatMap((p) => ruleSuspects(`${p.task}\n${p.answer}`).map((s) => `практика ${p.index}: ${s}`)),
    ...cards.flatMap((c) => ruleSuspects([c.prompt, c.answer ?? "", c.hint].join("\n")).map((s) => `карточка ${c.id}: ${s}`)),
  ];
  return {
    subject: plan.subject, language: groupLanguage(plan, g), grade: g.grade, topic: g.topic,
    keyIdea: e.keyIdea, steps: e.steps, examples, practice, cards, suspects,
    mistakes: e.mistakes.map((text, index) => ({ index, text })),
  };
}

export type RulesFixCount = { cards: number; examples: number; practice: number; mistakes: number; keyIdea: boolean };

/**
 * Применяет исправления к одному классу. Карточку меняем, только если исправленная проходит checkCard
 * и сохраняет тип; пример с другим условием теряет наглядный блок (он рисовал старое слово).
 * Что применено, считает fixed: это идёт в лог и в TEST_LOG.
 */
export function applyRulesReview(
  group: LessonPlan["groups"][number],
  review: RulesReview,
  toCard: (fix: RulesReview["cards"][number], old: TaskCard) => TaskCard | null,
): { group: LessonPlan["groups"][number]; fixed: RulesFixCount } {
  const fixed: RulesFixCount = { cards: 0, examples: 0, practice: 0, mistakes: 0, keyIdea: false };
  const fixCard = (c: TaskCard) => {
    const fix = review.cards.find((f) => f.id === c.id);
    const next = fix ? toCard(fix, c) : null;
    if (next) fixed.cards++;
    return next ?? c;
  };
  const cards = group.cards.map(fixCard);
  const extraCards = group.extraCards?.map(fixCard);
  const e = group.explanation;
  const all = [e.example, ...e.examples].map((x, i) => {
    const fix = review.examples.find((f) => f.index === i);
    if (!fix || fix.steps.length < 2 || fix.steps.length > 8) return x;
    if (introducesSuspects([x.problem, ...x.steps, x.answer].join("\n"), [fix.task, ...fix.steps, fix.answer].join("\n"))) return x;
    fixed.examples++;
    return { ...x, problem: fix.task, steps: fix.steps, answer: fix.answer, visual: fix.task.trim() === x.problem.trim() ? x.visual : null };
  });
  const practice = e.practice.map((p, i) => {
    const fix = review.practice.find((f) => f.index === i);
    if (!fix || introducesSuspects(`${p.task}\n${p.answer}`, `${fix.task}\n${fix.answer}`)) return p;
    fixed.practice++;
    return { task: fix.task, answer: fix.answer };
  });
  const mistakes = e.mistakes.map((m, i) => {
    const fix = review.mistakes.find((f) => f.index === i);
    if (!fix?.text.trim() || introducesSuspects(m, fix.text)) return m;
    fixed.mistakes++;
    return fix.text.trim();
  });
  const keyIdea = review.keyIdea?.trim();
  if (keyIdea && keyIdea !== e.keyIdea) fixed.keyIdea = true;
  const explanation: Explanation = { ...e, keyIdea: fixed.keyIdea && keyIdea ? keyIdea : e.keyIdea, example: all[0], examples: all.slice(1), practice, mistakes };
  return { group: { ...group, cards, explanation, ...(extraCards ? { extraCards } : {}) }, fixed };
}
