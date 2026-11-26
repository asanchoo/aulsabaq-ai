import { checkCardAnswer } from "./check-answer";
import {
  compileExpression,
  evaluateVariantExpression as evaluate,
} from "./expression";
import { gradeProfile, withinProfile } from "./grade-profile";
import type { Group, Lang, LessonPlan, TaskCard } from "./schema";
import type { CardVariant } from "./variant-schema";
import { seededTask, type TrainerSkill } from "./trainer";

export const mathSubject = (subject: string) =>
  /^(математика|алгебра|геометрия|math|algebra)$/iu.test(subject.trim());
const replace = (text: string, values: Record<string, number>) =>
  text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key: string) =>
    String(values[key]),
  );
const leaks = (hint: string, answer: string) =>
  new Set<string>(hint.match(/\d+(?:[.,]\d+)?/g) ?? []).has(answer);
function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function random(seed: string) {
  let value = hash(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A model template has to reproduce its original prompt AND answer, not just return any solvable expression. */
function render(
  template: CardVariant,
  group: Group,
  values: Record<string, number>,
): TaskCard | null {
  const profile = gradeProfile(group.grade, group.quarter, group.topic);
  const operations = [
    template.answerExpression,
    ...template.derived.map((d) => d.expression),
  ].join(" ");
  if (group.grade <= 4 && /\^/.test(operations)) return null;
  const operation = (op: string, _left: number, right: number) => {
    if ((op === "*" || op === "/") && !profile.multiplication) return false;
    if (group.grade === 2 && (op === "*" || op === "/"))
      return (
        right >= 2 &&
        right <= profile.tableMax &&
        (op === "*" ? _left <= 10 : _left / right <= 10)
      );
    return true;
  };
  const safe = (n: number) => withinProfile(n, profile);
  if (!Object.values(values).every(safe)) return null;
  for (const derived of template.derived) {
    const value = evaluate(derived.expression, values, safe, operation);
    if (
      value === null ||
      (Object.hasOwn(values, derived.name) && values[derived.name] !== value)
    )
      return null;
    values[derived.name] = value;
  }
  const expressions = template.answerExpression.split(";");
  if (expressions.length > 2) return null;
  const answers = expressions.map((expression) =>
    evaluate(expression, values, safe, operation),
  );
  if (answers.some((answer) => answer === null)) return null;
  const answer = answers[0]!;
  const answerText = [...new Set(answers)].join("; ");
  values.answer = answer;
  if (
    template.conditions.some((condition) => evaluate(condition, values) !== 1)
  )
    return null;
  const prompt = replace(template.prompt, values);
  const hint = replace(template.hint, values);
  if (prompt.includes("x") && prompt.includes("=")) {
    const [left, right, extra] = prompt
      .replace(/^.*?:\s*/, "")
      .replace(/[.?]$/, "")
      .split("=");
    const lhs = compileExpression(left),
      rhs = compileExpression(right ?? "");
    if (
      extra ||
      !lhs ||
      !rhs ||
      answers.some((root) => Math.abs(lhs(root!) - rhs(root!)) > 1e-8)
    )
      return null;
  }
  const arithmetic = prompt.match(
    /^[^0-9]*?\s*(\d+)\s*([+−*×·:/÷-])\s*(\d+)[.?]?$/u,
  );
  if (arithmetic) {
    const op = arithmetic[2]
      .replace("−", "-")
      .replace(/[×·]/, "*")
      .replace(/[:÷]/, "/");
    if (evaluate(`${arithmetic[1]}${op}${arithmetic[3]}`, {}) !== answer)
      return null;
  }
  if (
    /\{[^}]*\}|undefined/.test(prompt + hint) ||
    answers.some((value) => leaks(hint, String(value)))
  )
    return null;
  // Operands written literally in templates are checked too: they cannot hide 1000000 in a grade-1 task.
  const numbers = prompt.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (!numbers.every((n) => safe(Number(n.replace(",", "."))))) return null;
  return {
    id: "",
    type: "closed",
    purpose: "practice",
    difficulty: 1,
    prompt,
    hint,
    answer: answerText,
    accept: [answerText],
    successCriteria: hint,
  };
}

/** Only an unambiguous one-expression card can be inferred. Word problems require an explicit checked template. */
export function inferVariant(
  card: TaskCard,
  group: Group,
  lang: Lang,
): CardVariant | null {
  if (card.type !== "closed" || !card.answer) return null;
  const m = card.prompt.match(
    /^(?:(?:Вычисли|Найди (?:сумму|разность|произведение|частное|значение выражения)|Есепте|Көбейт|Қос|Азайт|Раздели(?: столбиком)?|Бөл(?:у)?|Баған түрінде бөл)\s*:?\s*)?(\d+)\s*([+−\-*×·:÷/])\s*(\d+)\s*(?:өрнегін есепте|(?:қосындысын|айырмасын|көбейтіндісін|бөліндісін|мәнін) тап)?[.?]?$/iu,
  );
  if (!m) return null;
  const a = +m[1],
    b = +m[3];
  const op = m[2].replace("−", "-").replace(/[×·]/, "*").replace(/[:÷]/, "/");
  const answer = evaluate(`${a}${op}${b}`, {});
  if (answer === null || card.answer.trim() !== String(answer)) return null;
  const profile = gradeProfile(group.grade, group.quarter, group.topic);
  if (
    !withinProfile(answer, profile) ||
    ((op === "*" || op === "/") && !profile.multiplication)
  )
    return null;
  const digits = (n: number) => ({
    min: n < 10 ? (op === "/" ? 2 : 1) : 10 ** (String(n).length - 1),
    max: Math.min(profile.max, 10 ** String(n).length - 1),
  });
  const ranges =
    op === "/"
      ? [
          { name: "q", ...digits(answer) },
          { name: "b", ...digits(b) },
        ]
      : [
          { name: "a", ...digits(a) },
          { name: "b", ...digits(b) },
        ];
  if (group.grade === 2 && (op === "*" || op === "/"))
    ranges[ranges.length - 1].max = 5;
  const conditions = [`answer <= ${profile.max}`, "answer >= 0"];
  if (op === "-") conditions.push("a >= b");
  if (/переход|ондықтан аттап/iu.test(group.topic) && op === "+")
    conditions.push("a % 10 + b % 10 >= 10");
  if (/заимств|переход|ондықтан аттап/iu.test(group.topic) && op === "-")
    conditions.push("a % 10 < b % 10");
  if (op === "/")
    conditions.push(`a >= ${digits(a).min}`, `a <= ${digits(a).max}`);
  return {
    prompt: card.prompt
      .replace(m[1], "{a}")
      .replace(new RegExp(`${m[3]}(?=[^0-9]*$)`), "{b}"),
    hint:
      lang === "ru"
        ? "Проверь результат обратным действием."
        : "Нәтижені кері амалмен тексер.",
    ranges,
    derived: op === "/" ? [{ name: "a", expression: "q*b" }] : [],
    answerExpression: op === "/" ? "q" : `a${op}b`,
    conditions,
    original:
      op === "/"
        ? [
            { name: "q", value: answer },
            { name: "b", value: b },
          ]
        : [
            { name: "a", value: a },
            { name: "b", value: b },
          ],
  };
}

/** Use an existing trainer only for a matching arithmetic shape; keep the card's own template and constraints. */
function matchingSkill(card: TaskCard, group: Group): TrainerSkill | null {
  if (!card.variant || !card.variant.ranges.some((r) => r.name === "b"))
    return null;
  const e = card.variant.answerExpression;
  if (e === "a+b" && group.grade === 1) return "add_within_20";
  if (e === "a-b" && group.grade === 1) return "sub_within_20";
  if (e === "a+b" && /переход|ондықтан аттап/iu.test(group.topic))
    return card.variant.ranges.find((r) => r.name === "b")!.max < 10
      ? "add_2d_1d_carry"
      : "add_2d_2d_carry";
  if (e === "a-b" && /переход|ондықтан аттап/iu.test(group.topic))
    return card.variant.ranges.find((r) => r.name === "b")!.max < 10
      ? "sub_2d_1d_borrow"
      : "sub_2d_borrow";
  if (e === "q" && card.variant.derived.some((d) => d.expression === "q*b"))
    return card.variant.conditions.includes("a <= 99")
      ? "div_2d_1d"
      : "div_3d_1d";
  return null;
}

/** Сокращения и неизменяемые слова после числа: им согласование не нужно. */
const RU_UNITS = /^(см|мм|дм|км|м|кг|г|т|л|мл|ч|мин|сек|с|тг|тенге|раза?|руб|шт|га)$/u;

/** Группа согласования русского существительного с числом: 1 метр, 2–4 метра, 5–20 метров. */
function pluralClass(n: number | undefined): string {
  if (n === undefined || !Number.isInteger(n)) return "other";
  const last2 = Math.abs(n) % 100;
  const last = last2 % 10;
  if (last2 >= 11 && last2 <= 14) return "many";
  if (last === 1) return "one";
  if (last >= 2 && last <= 4) return "few";
  return "many";
}

/** The same session/card seed is used by rendering, answer checks and hints; after 200 misses use the original. */
export function personalCard(
  card: TaskCard,
  group: Group,
  seed: string,
  lang: Lang,
): TaskCard {
  const template = card.variant;
  if (!template) return card;
  const r = random(`${seed}:${card.id}`);
  const skill = matchingSkill(card, group);
  // Русский: «15 метров» → «21 метров» неверно. Если сразу после числа стоит слово, число варианта берём
  // из той же группы согласования, что и исходное (1; 2–4; 5–20 и 0), тогда форма слова остаётся верной.
  const original = Object.fromEntries(template.original.map((x) => [x.name, x.value]));
  const agreeing = lang === "ru"
    ? [...`${template.prompt} ${template.hint}`.matchAll(/\{([a-z][a-z0-9_]*)\}\s+([а-яё]+)/giu)]
        .filter((m) => !RU_UNITS.test(m[2].toLowerCase()) && m[1] in original).map((m) => m[1])
    : [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const values: Record<string, number> = {};
    for (const range of template.ranges)
      values[range.name] =
        range.min + Math.floor(r() * (range.max - range.min + 1));
    if (skill) {
      const task = seededTask(skill, `${seed}:${card.id}`, attempt, lang);
      const numbers = task.prompt.match(/\d+/g)?.map(Number);
      if (numbers?.length === 2) {
        const fromSkill = template.answerExpression === "q"
          ? { q: Number(task.answer), b: numbers[1] }
          : { a: numbers[0], b: numbers[1] };
        // Числа тренажёра берём, только если они подходят под диапазоны шаблона. Иначе остаются свои случайные:
        // тренажёр 1 класса даёт однозначное первое слагаемое, а карточка «15 + 2» требует двузначное,
        // и без этой проверки все 200 попыток отбрасывались, у 1 класса не было ни одного варианта.
        const fits = template.ranges.every((range) => !(range.name in fromSkill)
          || (fromSkill[range.name as keyof typeof fromSkill]! >= range.min && fromSkill[range.name as keyof typeof fromSkill]! <= range.max));
        if (fits) Object.assign(values, fromSkill);
      }
    }
    if (
      template.ranges.some(
        (range) =>
          values[range.name] < range.min || values[range.name] > range.max,
      )
    )
      continue;
    if (agreeing.some((name) => pluralClass(values[name]) !== pluralClass(original[name]))) continue;
    const rendered = render(template, group, values);
    if (!rendered) continue;
    const base = { ...card };
    delete base.variant;
    return {
      ...base,
      ...rendered,
      id: card.id,
      purpose: card.purpose,
      difficulty: card.difficulty,
      minutes: card.minutes,
      inputHint: undefined,
    };
  }
  return card;
}

/** Reject unsupported mathematics rather than manufacturing a task with different semantics. */
export function validateVariant(
  card: TaskCard,
  group: Group,
  lang: Lang,
): string | null {
  const v = card.variant;
  if (!v) return null;
  const names = [...v.ranges, ...v.derived].map((x) => x.name);
  if (new Set(names).size !== names.length || names.includes("answer"))
    return "names";
  if (
    v.ranges.some(
      (r) => r.min > r.max || Math.abs(r.min) > 1e6 || Math.abs(r.max) > 1e6,
    )
  )
    return "ranges";
  const original = Object.fromEntries(v.original.map((x) => [x.name, x.value]));
  if (
    v.ranges.some(
      (r) =>
        !Object.hasOwn(original, r.name) ||
        original[r.name] < r.min ||
        original[r.name] > r.max,
    )
  )
    return "original_ranges";
  const rendered = render(v, group, original);
  if (
    !rendered ||
    rendered.prompt !== card.prompt ||
    !checkCardAnswer(rendered.answer ?? "", card)
  )
    return "original";
  // All task numbers must be parameterized; constants, multi-step formulas and unsupported advanced topics stay original.
  const fixed = v.prompt.replace(/\{[a-z][a-z0-9_]*\}/g, "");
  const structural =
    group.grade >= 8 && /квадрат|квадраттық/iu.test(group.topic)
      ? fixed.replace(/\^2|=\s*0/g, "")
      : fixed;
  if (/\d/.test(structural)) return "literal_numbers";
  for (let seed = 0; seed < 50; seed++)
    if (personalCard(card, group, `validation-${seed}`, lang) === card)
      return "no_solution";
  return null;
}

/** A complete plan is cheap to personalize; IDs are preserved, so classroom analytics continue to aggregate. */
export function personalPlan(plan: LessonPlan, seed: string): LessonPlan {
  if (!mathSubject(plan.subject) || plan.numberVariants === false) return plan;
  return {
    ...plan,
    groups: plan.groups.map((g) => ({
      ...g,
      cards: g.cards.map((c) =>
        personalCard(c, g, seed, g.language ?? plan.language),
      ),
      extraCards: g.extraCards?.map((c) =>
        personalCard(c, g, seed, g.language ?? plan.language),
      ),
    })),
  };
}
