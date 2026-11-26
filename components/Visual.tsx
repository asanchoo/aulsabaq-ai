import { compileExpression } from "@/lib/expression";
import { t, type Dict } from "@/lib/i18n";
import { buildUnits, columnBorrows, columnCarries, columnResult, longDivision, partialProducts, shownUnits, type Visual as VisualData } from "@/lib/visuals";

/**
 * Наглядный блок объяснения. Модель дала только вид и данные (lib/visuals.ts), а здесь код рисует
 * и сам считает всё, что видит ученик: шаги деления, перенос, результат, точки графика.
 * size="slide" — для показа классу на экране (крупно), "page" — на странице урока.
 * build (0…1) — какая доля шагов слайда уже открыта: уголок, столбик, луч и кучки достраиваются вместе
 * с шагами. Без build схема целиком (страница урока, печать, памятка ученика).
 * Без хуков и без "use client": работает и на сервере (страница урока), и в слайдах.
 */
type Labels = Dict["visual"];
type Size = "slide" | "page";

export function Visual({ visual, labels, size = "page", build }: { visual: VisualData; labels: Labels; size?: Size; build?: number }) {
  const text = size === "slide" ? "text-[clamp(1.4rem,3.2vw,2.6rem)]" : "text-[1.15rem]";
  return (
    // @container: схема подстраивается под место, которое ей дали (половина слайда, колонка страницы), а не под экран.
    <figure className="@container grid min-w-0 gap-3">
      <div className={`min-w-0 overflow-x-auto ${text}`}>{body(visual, labels, size, build)}</div>
      <figcaption className={size === "slide" ? "max-w-[50ch] text-[clamp(1rem,1.8vw,1.35rem)] leading-snug text-muted" : "text-[0.9rem] leading-snug text-muted"}>
        {visual.caption}
      </figcaption>
    </figure>
  );
}

/**
 * Класс части схемы, которая строится по шагам. Скрытая часть невидима, но занимает своё место:
 * слайд не прыгает, а размер подбирается один раз. Без построения (shown не задан) классов нет.
 */
const reveal = (building: boolean, visible: boolean) => (!building ? "" : visible ? "fade-in" : "invisible");

function body(v: VisualData, labels: Labels, size: Size, build?: number) {
  const shown = build === undefined ? undefined : shownUnits(buildUnits(v), build);
  switch (v.kind) {
    case "long_division": return <LongDivision dividend={v.dividend} divisor={v.divisor} labels={labels} shown={shown} />;
    case "column": return <Column a={v.a} b={v.b} op={v.op} shown={shown} />;
    case "number_line": return <NumberLine from={v.from} to={v.to} points={v.points} shown={shown} />;
    case "groups": return <Groups groups={v.groups} perGroup={v.perGroup} op={v.op} shown={shown} />;
    case "fraction": return <Fraction numerator={v.numerator} denominator={v.denominator} />;
    case "grid": return <Grid columns={v.columns} rows={v.rows} />;
    case "plot": return <Plot expression={v.expression} from={v.from} to={v.to} areaFrom={v.areaFrom} areaTo={v.areaTo} />;
    case "formula": return <Formula formula={v.formula} legend={v.legend} steps={v.steps} />;
    case "table": return <Table headers={v.headers} rows={v.rows} size={size} />;
    case "sentence": return <Sentence tokens={v.tokens} labels={labels} />;
    case "word": return <Word parts={v.parts} labels={labels} />;
    case "flow": return <Flow items={v.items} cycle={v.cycle} labels={labels} />;
    case "bars": return <Bars labels={v.labels} values={v.values} />;
  }
}

// --- Арифметика в тетрадной записи --------------------------------------------------------------

/** Строка моноширинных клеток: каждая цифра в своей клетке, как в тетради. */
function Cells({ chars, marks, show, className = "", small = false }: { chars: string[]; marks?: boolean[]; show?: boolean[]; className?: string; small?: boolean }) {
  return (
    <div className={`flex ${className}`}>
      {chars.map((c, i) => (
        <span key={i} className={`relative inline-block w-[1.15ch] text-center ${small ? "h-[0.75em] leading-none" : ""} ${reveal(!!show, show?.[i] ?? true)}`}>
          {marks?.[i] && <span aria-hidden className="absolute -top-[0.2em] left-1/2 size-[0.25em] -translate-x-1/2 rounded-full bg-help" />}
          {/* Мелкая цифра переноса — в клетке той же ширины, что и цифры числа, иначе она уедет из своего разряда. */}
          {small ? <span className="text-[0.6em]">{c === " " ? " " : c}</span> : c === " " ? " " : c}
        </span>
      ))}
    </div>
  );
}

const padLeft = (s: string, width: number) => s.padStart(width, " ").split("");

function LongDivision({ dividend, divisor, labels, shown }: { dividend: number; divisor: number; labels: Labels; shown?: number }) {
  const { steps, quotient, remainder } = longDivision(dividend, divisor);
  // Одна часть на цифру частного: цифра частного, вычитаемое под чертой и новое число для следующего шага.
  const building = shown !== undefined;
  const done = shown ?? steps.length;
  const width = String(dividend).length + 1; // +1 клетка слева под знак минус
  // Строка, которая заканчивается под цифрой делимого с индексом end.
  const at = (text: string, end: number) => {
    const chars = (" ".repeat(end + 2 - text.length) + text).split("");
    return [...chars, ...Array(Math.max(0, width - chars.length)).fill(" ")].slice(0, width);
  };
  const rows: { chars: string[]; rule?: [number, number]; step: number }[] = [];
  steps.forEach((s, k) => {
    if (k > 0) rows.push({ chars: at(String(s.current), s.end), step: k });
    if (s.product > 0 || k === 0) {
      const productChars = at(String(s.product), s.end);
      productChars[s.end + 1 - String(s.product).length] = "−";
      rows.push({ chars: productChars, rule: [s.end + 2 - String(s.product).length, s.end + 1], step: k });
    }
  });
  const last = steps[steps.length - 1];
  rows.push({ chars: at(String(last.remainder), last.end), step: steps.length - 1 });
  const complete = done >= steps.length;

  return (
    // Пока схема не достроена, экранный диктор слышит только задачу: ответ откроется вместе с последним шагом.
    <div className="tabular inline-flex items-start font-mono leading-[1.25]" role="img" aria-label={complete ? `${dividend} : ${divisor} = ${quotient}${remainder ? `, ${t(labels.remainder, { r: remainder })}` : ""}` : `${dividend} : ${divisor}`}>
      <div>
        <Cells chars={[" ", ...String(dividend).split("")]} />
        {rows.map((row, i) => (
          <div key={i} className={reveal(building, row.step < done)}>
            <Cells chars={row.chars} />
            {row.rule && (
              <div className="flex">
                {row.chars.map((_, c) => (
                  <span key={c} className={`inline-block h-0 w-[1.15ch] ${c >= row.rule![0] && c <= row.rule![1] ? "border-t-2 border-ink" : ""}`} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="ml-[0.2ch] border-l-2 border-ink pl-[0.4ch]">
        <Cells chars={String(divisor).split("")} />
        <div className="border-t-2 border-ink font-semibold">
          <Cells chars={String(quotient).split("")} show={building ? String(quotient).split("").map((_, j) => j < done) : undefined} />
        </div>
        {remainder > 0 && <p className={`mt-1 text-[0.55em] font-sans text-muted ${reveal(building, complete)}`}>{t(labels.remainder, { r: remainder })}</p>}
      </div>
    </div>
  );
}

function Column({ a, b, op, shown }: { a: number; b: number; op: "+" | "-" | "×"; shown?: number }) {
  const result = columnResult(a, b, op);
  const partials = op === "×" && String(b).length > 1 ? partialProducts(a, b) : [];
  const partialStrings = partials.map((p, i) => String(p) + " ".repeat(i));
  const width = Math.max(String(a).length, String(b).length + 1, String(result).length, ...partialStrings.map((p) => p.length)) + 1;
  // Строится по разрядам справа налево (при умножении на многозначное: частичные произведения, потом сумма).
  // done — сколько разрядов (или строк) уже посчитано; col(pos) — номер разряда клетки справа, с нуля.
  const units = partials.length ? partials.length + 1 : Math.max(String(a).length, String(b).length);
  const building = shown !== undefined;
  const done = shown ?? units;
  const complete = done >= units;
  const col = (pos: number) => width - 1 - pos;

  // Перенос (сложение) — маленькая цифра над колонкой; заём (вычитание) — точка над цифрой, у которой заняли.
  // Оба появляются, когда посчитан разряд справа от них: так их и пишут в тетради.
  let carryRow: string[] | null = null;
  if (op === "+") {
    const carries = columnCarries(a, b);
    if (carries.some((c) => c > 0)) carryRow = Array.from({ length: width }, (_, pos) => (carries[col(pos)] ? "1" : " "));
  }
  const aChars = padLeft(String(a), width);
  const marks = op === "-" ? aChars.map((_, pos) => (columnBorrows(a, b)[col(pos)] ?? false) && col(pos) <= done) : undefined;
  const bChars = padLeft(String(b), width);
  bChars[0] = op === "-" ? "−" : op;
  const resultChars = padLeft(String(result), width);
  // Лишняя старшая цифра суммы или произведения (36 + 78 = 114) появляется вместе с последним разрядом.
  const resultShow = building ? resultChars.map((_, pos) => complete || (!partials.length && col(pos) < done)) : undefined;
  const sign = op === "-" ? "−" : op;

  return (
    <div className="tabular inline-block pt-[0.3em] font-mono leading-[1.3]" role="img" aria-label={complete ? `${a} ${sign} ${b} = ${result}` : `${a} ${sign} ${b}`}>
      {carryRow && <Cells chars={carryRow} small show={building ? carryRow.map((_, pos) => col(pos) <= done) : undefined} className="mb-[0.1em] font-semibold text-help" />}
      <Cells chars={aChars} marks={marks} />
      <Cells chars={bChars} />
      <div className="border-t-2 border-ink" style={{ width: `${width * 1.15}ch` }} />
      {partialStrings.length > 0 && (
        <>
          {partialStrings.map((p, i) => <Cells key={i} chars={padLeft(p, width)} className={`text-muted ${reveal(building, i < done)}`} />)}
          <div className={`border-t-2 border-ink ${reveal(building, complete)}`} style={{ width: `${width * 1.15}ch` }} />
        </>
      )}
      <Cells chars={resultChars} show={resultShow} className="font-semibold" />
    </div>
  );
}

// --- Числа и доли ------------------------------------------------------------------------------

/** «Красивый» шаг делений шкалы: 1, 2, 5, 10, 20, 50… так, чтобы делений было около count. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",").replace("-", "−");

function NumberLine({ from, to, points, shown }: { from: number; to: number; points: number[]; shown?: number }) {
  // Строится по прыжкам: сначала луч и первая точка, потом каждый прыжок со своей точкой.
  const building = shown !== undefined;
  const done = shown ?? points.length - 1;
  const W = 640, left = 30, right = 610, y = 120;
  const x = (v: number) => left + ((v - from) / (to - from)) * (right - left);
  // На целом луче деления только целые: 58, 59, 60, а не 58,5 (полшага путают младших школьников).
  const integral = [from, to, ...points].every(Number.isInteger);
  const step = Math.max(niceStep(to - from, 10), integral ? 1 : 0);
  const ticks: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} 185`} className="w-full max-w-[44rem]" role="img" aria-label={points.slice(0, done + 1).map(fmt).join(" → ")}>
      <line x1={left - 10} x2={right + 12} y1={y} y2={y} className="stroke-ink" strokeWidth="2.5" />
      <path d={`M${right + 12} ${y} l-10 -6 v12 z`} className="fill-ink" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={y - 7} y2={y + 7} className="stroke-ink" strokeWidth="1.5" />
          <text x={x(v)} y={y + 30} textAnchor="middle" className="fill-muted text-[15px]">{fmt(v)}</text>
        </g>
      ))}
      {points.slice(1).map((p, i) => {
        const a = x(points[i]), b = x(p), mid = (a + b) / 2, h = Math.min(70, 18 + Math.abs(b - a) / 3);
        const delta = p - points[i];
        return (
          <g key={i} className={reveal(building, i < done)}>
            <path d={`M${a} ${y - 4} Q ${mid} ${y - 2 * h} ${b} ${y - 4}`} fill="none" className="stroke-ink" strokeWidth="2" strokeDasharray={i % 2 ? "6 4" : undefined} />
            <path d={`M${b} ${y - 4} l-9 -5 l2 9 z`} className="fill-ink" />
            <rect x={mid - 26} y={y - h - 26} width="52" height="24" rx="12" className="fill-mint stroke-ink" strokeWidth="1" />
            <text x={mid} y={y - h - 9} textAnchor="middle" className="fill-ink text-[15px] font-semibold">{delta >= 0 ? "+" : "−"}{fmt(Math.abs(delta))}</text>
          </g>
        );
      })}
      {points.map((p, i) => (
        <g key={`p${i}`} className={reveal(building, i <= done)}>
          <circle cx={x(p)} cy={y} r="7" className={i === points.length - 1 ? "fill-ink" : "fill-white stroke-ink"} strokeWidth="2.5" />
          <text x={x(p)} y={y + 56} textAnchor="middle" className="fill-ink text-[18px] font-semibold">{fmt(p)}</text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Предметы кружками. «×»: groups кучек по perGroup. «+»: две кучки, вторая полыми кружками.
 * «−»: groups кружков, последние perGroup зачёркнуты. Равенство под блоком считает код (shownEquation).
 */
function Groups({ groups, perGroup, op, shown }: { groups: number; perGroup: number; op: "+" | "-" | "×"; shown?: number }) {
  const result = op === "+" ? groups + perGroup : op === "-" ? groups - perGroup : groups * perGroup;
  const sign = op === "-" ? "−" : op;
  const equation = `${groups} ${sign} ${perGroup} = ${result}`;
  // Строится так: «×» — кучки появляются по одной; «+» — вторая кучка; «−» — убранные предметы зачёркиваются.
  // Равенство с ответом — когда схема достроена.
  const units = op === "×" ? groups : 1;
  const building = shown !== undefined;
  const done = shown ?? units;
  const complete = done >= units;
  const pile = "flex max-w-[7.5em] flex-wrap content-center justify-center gap-[0.25em] rounded-full border-2 border-ink bg-mint-soft p-[0.6em]";
  const dot = "size-[0.55em] rounded-full bg-ink";
  const hollow = "size-[0.55em] rounded-full border-2 border-ink bg-white";
  const dots = (n: number, className: string) => Array.from({ length: n }, (_, i) => <span key={i} className={className} />);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3" role="img" aria-label={complete ? equation : `${groups} ${sign} ${perGroup}`}>
        {op === "×" && Array.from({ length: groups }, (_, g) => <div key={g} className={`${pile} ${reveal(building, g < done)}`}>{dots(perGroup, dot)}</div>)}
        {op === "+" && (
          <>
            {groups > 0 && <div className={pile}>{dots(groups, dot)}</div>}
            <span aria-hidden className={`font-mono font-semibold ${reveal(building, complete)}`}>+</span>
            {perGroup > 0 && <div className={`${pile} ${reveal(building, complete)}`}>{dots(perGroup, hollow)}</div>}
          </>
        )}
        {op === "-" && (
          <div className={pile}>
            {dots(groups - perGroup, dot)}
            {Array.from({ length: perGroup }, (_, i) =>
              complete ? (
                <span key={`x${i}`} className={`relative size-[0.55em] rounded-full border-2 border-ink bg-white ${reveal(building, true)}`}>
                  <span className="absolute top-1/2 left-[-0.15em] h-[2px] w-[0.85em] -rotate-45 bg-ink" />
                </span>
              ) : (
                <span key={`x${i}`} className={dot} />
              ),
            )}
          </div>
        )}
      </div>
      <p className={`tabular font-mono font-semibold ${reveal(building, complete)}`}>{equation}</p>
    </div>
  );
}

function Fraction({ numerator, denominator }: { numerator: number; denominator: number }) {
  const bars = Math.max(1, Math.ceil(numerator / denominator));
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="grid w-full max-w-[28rem] gap-2" role="img" aria-label={`${numerator}/${denominator}`}>
        {Array.from({ length: bars }, (_, b) => (
          <div key={b} className="flex h-[1.6em] overflow-hidden rounded-md border-2 border-ink">
            {Array.from({ length: denominator }, (_, i) => (
              <span key={i} className={`flex-1 border-ink ${i > 0 ? "border-l-2" : ""} ${b * denominator + i < numerator ? "bg-mint" : "bg-white"}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="tabular inline-grid text-center font-mono text-[1.5em] leading-none font-semibold">
        <span>{numerator}</span>
        <span className="my-1 border-t-2 border-ink" />
        <span>{denominator}</span>
      </div>
    </div>
  );
}

function Grid({ columns, rows }: { columns: number; rows: number }) {
  const cell = Math.min(36, Math.floor(360 / Math.max(columns, rows)));
  const W = columns * cell, H = rows * cell;
  return (
    <div className="grid gap-3">
      <svg viewBox={`-34 -30 ${W + 40} ${H + 36}`} className="w-full max-w-[20rem]" role="img" aria-label={`${columns} × ${rows} = ${columns * rows}`}>
        {Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => (
          <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} className="fill-mint stroke-ink" strokeWidth="1.2" />
        )))}
        <rect x="0" y="0" width={W} height={H} fill="none" className="stroke-ink" strokeWidth="2.5" />
        <text x={W / 2} y={-10} textAnchor="middle" className="fill-ink text-[16px] font-semibold">{columns}</text>
        <text x={-12} y={H / 2 + 6} textAnchor="end" className="fill-ink text-[16px] font-semibold">{rows}</text>
      </svg>
      <p className="tabular font-mono font-semibold">{columns} × {rows} = {columns * rows}</p>
    </div>
  );
}

// --- График функции ------------------------------------------------------------------------------

/** Подпись графика по-школьному: x² вместо x^2, · вместо *. */
function prettyExpression(expression: string): string {
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return expression
    .replace(/^\s*y\s*=\s*/, "")
    .replace(/\^(\d)/g, (_, d: string) => sup[d])
    .replace(/\*/g, " · ")
    .replace(/-/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}

function Plot({ expression, from, to, areaFrom, areaTo }: { expression: string; from: number; to: number; areaFrom: number | null; areaTo: number | null }) {
  const fn = compileExpression(expression);
  if (!fn) return <p className="font-mono">y = {expression}</p>;
  const W = 640, H = 400, pad = 44;
  const N = 300;
  const xs = Array.from({ length: N + 1 }, (_, i) => from + ((to - from) * i) / N);
  const ys = xs.map(fn);
  const finite = ys.filter(Number.isFinite).sort((a, b) => a - b);
  // Крайние 2% значений не растягивают масштаб (у 1/x около нуля значения уходят в бесконечность).
  let yMin = finite[Math.floor(finite.length * 0.02)] ?? -1;
  let yMax = finite[Math.ceil(finite.length * 0.98) - 1] ?? 1;
  yMin = Math.min(yMin, 0);
  yMax = Math.max(yMax, 0);
  if (yMax - yMin < 1e-9) { yMax += 1; yMin -= 1; }
  const span = yMax - yMin;
  yMin -= span * 0.08;
  yMax += span * 0.08;
  const px = (x: number) => pad + ((x - from) / (to - from)) * (W - 2 * pad);
  const py = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad);

  let d = "";
  let pen = false;
  xs.forEach((x, i) => {
    const y = ys[i];
    if (!Number.isFinite(y) || y < yMin - span * 2 || y > yMax + span * 2) { pen = false; return; }
    d += `${pen ? "L" : "M"}${px(x).toFixed(1)} ${py(Math.max(yMin, Math.min(yMax, y))).toFixed(1)} `;
    pen = true;
  });

  let area = "";
  if (areaFrom !== null && areaTo !== null) {
    const pts = xs.filter((x) => x >= areaFrom && x <= areaTo);
    const clampY = (y: number) => py(Math.max(yMin, Math.min(yMax, Number.isFinite(y) ? y : 0)));
    area = `M${px(areaFrom)} ${py(0)} ` + [areaFrom, ...pts, areaTo].map((x) => `L${px(x).toFixed(1)} ${clampY(fn(x)).toFixed(1)}`).join(" ") + ` L${px(areaTo)} ${py(0)} Z`;
  }

  const xStep = niceStep(to - from, 8);
  const yStep = niceStep(yMax - yMin, 6);
  const xTicks: number[] = [];
  for (let v = Math.ceil(from / xStep) * xStep; v <= to + 1e-9; v += xStep) xTicks.push(v);
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) yTicks.push(v);
  const axisX = from <= 0 && to >= 0 ? px(0) : pad;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[44rem]" role="img" aria-label={`y = ${expression}`}>
      {xTicks.map((v) => <line key={`gx${v}`} x1={px(v)} x2={px(v)} y1={pad} y2={H - pad} className="stroke-line" strokeWidth="1" />)}
      {yTicks.map((v) => <line key={`gy${v}`} x1={pad} x2={W - pad} y1={py(v)} y2={py(v)} className="stroke-line" strokeWidth="1" />)}
      {area && <path d={area} className="fill-mint stroke-ink" strokeWidth="1" opacity="0.85" />}
      <line x1={pad} x2={W - pad + 10} y1={py(0)} y2={py(0)} className="stroke-ink" strokeWidth="2" />
      <line x1={axisX} x2={axisX} y1={H - pad} y2={pad - 10} className="stroke-ink" strokeWidth="2" />
      {xTicks.map((v) => Math.abs(v) > 1e-9 && <text key={`tx${v}`} x={px(v)} y={Math.min(H - pad, py(0)) + 20} textAnchor="middle" className="fill-muted text-[13px]">{fmt(v)}</text>)}
      {yTicks.map((v) => Math.abs(v) > 1e-9 && <text key={`ty${v}`} x={axisX - 8} y={py(v) + 4} textAnchor="end" className="fill-muted text-[13px]">{fmt(v)}</text>)}
      <text x={W - pad + 12} y={py(0) - 8} className="fill-ink text-[15px] font-semibold">x</text>
      <text x={axisX + 8} y={pad - 12} className="fill-ink text-[15px] font-semibold">y</text>
      <path d={d} fill="none" className="stroke-ink" strokeWidth="3" strokeLinejoin="round" />
      <text x={W - pad - 8} y={pad + 4} textAnchor="end" paintOrder="stroke" stroke="white" strokeWidth="6" className="fill-ink text-[19px] font-semibold">
        y = {prettyExpression(expression)}
      </text>
    </svg>
  );
}

// --- Формула, таблица, язык, схемы ----------------------------------------------------------------

function Formula({ formula, legend, steps }: { formula: string; legend: [string, string][]; steps: string[] }) {
  return (
    <div className="grid gap-4">
      <p className="w-fit rounded-card border-2 border-ink bg-mint-soft px-[0.8em] py-[0.4em] text-[1.4em] font-semibold tracking-[-0.01em]">{formula}</p>
      {legend.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[0.8em]">
          {legend.map(([symbol, meaning]) => (
            <div key={symbol} className="contents">
              <dt className="font-mono font-semibold">{symbol}</dt>
              <dd className="text-ink/85">{meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      {steps.length > 0 && (
        <ol className="tabular grid gap-1 font-mono text-[0.9em]">
          {steps.map((s, i) => <li key={i} className={i === steps.length - 1 ? "font-semibold" : ""}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

function Table({ headers, rows, size }: { headers: string[]; rows: string[][]; size: Size }) {
  return (
    <table className={`w-full max-w-[48rem] border-collapse text-left ${size === "slide" ? "text-[0.75em]" : "text-[0.85em]"}`}>
      <thead>
        <tr>{headers.map((h) => <th key={h} scope="col" className="border-b-2 border-ink px-3 py-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-line">
            {/* Первый столбец обычно выражение («756 : 3»): его не рвём на две строки. Широкую таблицу слайд уменьшит целиком. */}
            {row.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "font-semibold whitespace-nowrap" : ""}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Подчёркивание членов предложения, как в тетради: одна черта, две, пунктир, волна, точки. */
const ROLE_LINE = {
  subject: "underline decoration-solid",
  predicate: "underline decoration-double",
  object: "underline decoration-dashed",
  attribute: "underline decoration-wavy",
  adverbial: "underline decoration-dotted",
  none: "",
} as const;

function Sentence({ tokens, labels }: { tokens: { text: string; role: keyof typeof ROLE_LINE }[]; labels: Labels }) {
  const used = [...new Set(tokens.map((t) => t.role))].filter((r) => r !== "none");
  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap gap-x-[0.45em] gap-y-2 leading-[1.6]">
        {tokens.map((tok, i) => (
          <span key={i} className={`${ROLE_LINE[tok.role]} decoration-2 underline-offset-[0.28em]`} title={tok.role === "none" ? undefined : labels.roles[tok.role]}>
            {tok.text}
          </span>
        ))}
      </p>
      {used.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.7em] text-ink/85">
          {used.map((r) => (
            <li key={r} className={`${ROLE_LINE[r]} decoration-[1.5px] underline-offset-[0.35em]`}>{labels.roles[r]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Значки состава слова над частями: приставка, корень дугой, суффикс домиком, окончание в рамке. */
function PartMark({ part }: { part: "prefix" | "root" | "suffix" | "ending" | "postfix" }) {
  const common = { fill: "none", className: "stroke-ink", strokeWidth: 2.2, vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="h-[0.5em] w-full">
      {part === "prefix" && <path d="M2 2 H98 V18" {...common} />}
      {part === "postfix" && <path d="M2 18 V2 H98" {...common} />}
      {part === "root" && <path d="M3 18 Q50 -6 97 18" {...common} />}
      {part === "suffix" && <path d="M5 18 L50 2 L95 18" {...common} />}
    </svg>
  );
}

function Word({ parts, labels }: { parts: { text: string; part: "prefix" | "root" | "suffix" | "ending" | "postfix" }[]; labels: Labels }) {
  const used = [...new Set(parts.map((p) => p.part))];
  return (
    <div className="grid gap-4">
      <p className="flex items-end text-[1.5em] font-semibold" aria-label={parts.map((p) => `${p.text}: ${labels.parts[p.part]}`).join(", ")}>
        {parts.map((p, i) => (
          <span key={i} className="inline-flex flex-col items-stretch">
            {p.part === "ending" ? <span className="h-[0.5em]" /> : <PartMark part={p.part} />}
            <span className={p.part === "ending" ? "border-2 border-ink px-[0.08em] leading-[1.1]" : "px-[0.04em] leading-[1.1]"}>{p.text}</span>
          </span>
        ))}
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.7em] text-ink/85">
        {used.map((part) => (
          <li key={part} className="inline-flex flex-col items-start">
            {part === "ending" ? <span className="h-[0.5em]" /> : <span className="w-[2.4em]"><PartMark part={part} /></span>}
            <span className={part === "ending" ? "border-2 border-ink px-1" : ""}>{labels.parts[part]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Flow({ items, cycle, labels }: { items: string[]; cycle: boolean; labels: Labels }) {
  return (
    <div className="grid gap-3">
      {/* Всегда столбиком со стрелками вниз: строкой длинные шаги переносились, и стрелки «→» в конце строк
          указывали в пустоту (на слайде рядом с правилом, на странице урока). */}
      <ol className="flex max-w-[34em] flex-col items-stretch gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col items-stretch gap-2">
            <span className="flex min-h-[2.4em] items-center gap-[0.5em] rounded-card border-2 border-ink bg-white px-[0.7em] py-[0.35em] text-[0.8em] leading-snug">
              <span className="tabular grid size-[1.5em] shrink-0 place-items-center rounded-full bg-mint text-[0.8em] font-semibold">{i + 1}</span>
              {item}
            </span>
            {i < items.length - 1 && (
              <svg aria-hidden viewBox="0 0 24 24" className="size-[1em] shrink-0 rotate-90 self-center" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            )}
          </li>
        ))}
      </ol>
      {cycle && (
        <p className="flex items-center gap-2 text-[0.7em] text-muted">
          <svg aria-hidden viewBox="0 0 24 24" className="size-[1.2em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {labels.again}
        </p>
      )}
    </div>
  );
}

function Bars({ labels, values }: { labels: string[]; values: number[] }) {
  const W = 640, H = 300, pad = 40;
  const max = Math.max(...values, 1e-9);
  const slot = (W - 2 * pad) / values.length;
  const bar = Math.min(80, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full max-w-[44rem]" role="img" aria-label={labels.map((l, i) => `${l}: ${fmt(values[i])}`).join(", ")}>
      <line x1={pad} x2={W - pad} y1={H} y2={H} className="stroke-ink" strokeWidth="2" />
      {values.map((v, i) => {
        const h = ((H - pad) * v) / max;
        const x = pad + slot * i + (slot - bar) / 2;
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bar} height={h} rx="4" className="fill-mint stroke-ink" strokeWidth="1.5" />
            <text x={x + bar / 2} y={H - h - 8} textAnchor="middle" className="fill-ink text-[16px] font-semibold">{fmt(v)}</text>
            <text x={x + bar / 2} y={H + 24} textAnchor="middle" className="fill-muted text-[14px]">{labels[i].length > 14 ? `${labels[i].slice(0, 13)}…` : labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
