/**
 * Разбор формулы функции для графика: «x^2 - 3x + 2», «sin(x)», «2·√x».
 * Свой маленький разборщик, а не eval: формулу пишет модель, и выполнять её как код нельзя.
 * Понимает числа, x, pi и e, + − × · * / ^, скобки, неявное умножение («2x», «3(x+1)»),
 * функции sin, cos, tan, sqrt (√), abs, ln, log, exp и степени ² ³.
 */

type Fn = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10,
};

function tokenize(raw: string): string[] | null {
  const text = raw
    .toLowerCase()
    .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/, "")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (sup) => `^${[...sup].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join("")}`)
    .replace(/√/g, "sqrt ")
    .replace(/π/g, "pi")
    .replace(/,/g, ".");
  const tokens: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|[a-z]+|[+\-*/^()])/y;
  let pos = 0;
  while (pos < text.length) {
    if (/^\s+$/.test(text.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) return null;
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

/** Функция от x или null, если формулу разобрать нельзя. */
export function compileExpression(source: string): Fn | null {
  if (source.length > 120) return null;
  const parsed = tokenize(source);
  if (!parsed || parsed.length === 0) return null;
  const tokens: string[] = parsed;
  let i = 0;
  const peek = () => tokens[i];
  const startsFactor = (t: string | undefined) => !!t && (/^\d/.test(t) || /^[a-z]/.test(t) || t === "(");

  // expr := term (('+'|'-') term)*
  function expr(): Fn | null {
    let left = term();
    while (left && (peek() === "+" || peek() === "-")) {
      const op = tokens[i++];
      const right = term();
      if (!right) return null;
      const l = left;
      left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }
  // term := unary (('*'|'/'|неявное умножение) unary)*
  function term(): Fn | null {
    let left = unary();
    while (left) {
      const t = peek();
      if (t === "*" || t === "/") {
        i++;
        const right = unary();
        if (!right) return null;
        const l = left;
        left = t === "*" ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (startsFactor(t)) {
        const right = power();
        if (!right) return null;
        const l = left;
        left = (x) => l(x) * right(x);
      } else break;
    }
    return left;
  }
  function unary(): Fn | null {
    if (peek() === "-") {
      i++;
      const v = unary();
      return v && ((x) => -v(x));
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return power();
  }
  // power := atom ('^' unary)?  (степень правоассоциативна: 2^3^2 = 2^9)
  function power(): Fn | null {
    const base = atom();
    if (!base) return null;
    if (peek() === "^") {
      i++;
      const exp = unary();
      if (!exp) return null;
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }
  function atom(): Fn | null {
    const t = tokens[i++];
    if (t === undefined) return null;
    if (/^\d/.test(t)) {
      const v = Number(t);
      return () => v;
    }
    if (t === "(") {
      const inner = expr();
      if (!inner || tokens[i++] !== ")") return null;
      return inner;
    }
    if (t === "x") return (x) => x;
    if (t === "pi") return () => Math.PI;
    if (t === "e") return () => Math.E;
    const fn = FUNCTIONS[t];
    if (fn) {
      const arg = peek() === "(" ? atom() : power();
      return arg && ((x) => fn(arg(x)));
    }
    return null;
  }

  const result = expr();
  return result && i === tokens.length ? result : null;
}
