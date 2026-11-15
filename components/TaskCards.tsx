import type { Group } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";

/**
 * Карточки для самостоятельной работы.
 * На экране ответ спрятан под «Показать ответ».
 * При печати ответ печатается вверх ногами внизу карточки: классический приём
 * для самопроверки, ученик решает, потом переворачивает лист.
 * Подсказка ведёт к решению, не называя ответ (инвариант 8), поэтому её можно печатать открыто.
 * Метка «Повторение» / «Новая тема» подсказывает учителю, какие карточки можно дать
 * до объяснения (инвариант 7 в lib/validate.ts).
 */
export function TaskCards({ groups, dict }: { groups: Group[]; dict: Dict }) {
  return (
    <div className={`grid gap-12 print:block ${groups.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"} md:gap-8`}>
      {groups.map((g) => (
        <section key={g.id} className="print:mb-6 print:break-after-page last:print:break-after-auto">
          <header className="border-b border-ink pb-4">
            <h3 className="text-[1.5rem] font-semibold tracking-[-0.02em]">{t(dict.common.grade, { n: g.grade })}</h3>
            <p className="mt-1 font-medium">{g.topic}</p>
            <p className="mt-2 text-[0.9rem] leading-snug text-muted">
              <span className="font-semibold text-ink">{dict.lesson.goal}:</span> {g.learningGoal}
            </p>
          </header>

          <ol className="mt-4 grid gap-3 print:grid-cols-2">
            {g.cards.map((card, i) => (
              <li
                key={card.id}
                className="flex flex-col rounded-card border border-line bg-white p-5 transition-colors hover:border-line-strong print:break-inside-avoid print:rounded-none print:border-dashed print:border-faint"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[0.78rem] font-medium text-muted">
                    {t(dict.common.card, { n: i + 1 })}
                    <span className="print:hidden"> · {t(dict.common.gradeShort, { n: g.grade })}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${card.purpose === "review" ? "bg-surface text-muted" : "bg-mint-soft text-ink"}`}
                    >
                      {dict.lesson.purpose[card.purpose]}
                    </span>
                    <Difficulty level={card.difficulty} label={t(dict.lesson.difficulty, { n: card.difficulty })} />
                  </span>
                </div>

                <p className="mt-3 text-[1.15rem] leading-snug font-medium tracking-[-0.01em]">{card.prompt}</p>
                {card.type === "open" && <p className="mt-1.5 text-[0.78rem] font-semibold text-muted">{dict.lesson.openTask}</p>}
                <p className="mt-3 text-[0.88rem] leading-snug text-muted">
                  <span className="font-semibold text-ink">{dict.lesson.criteria}:</span> {card.successCriteria}
                </p>

                <details className="group mt-4 print:hidden">
                  <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-btn border border-line-strong px-3 text-[0.86rem] font-semibold select-none hover:border-ink [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 4 4 4-4 4" />
                    </svg>
                    {dict.lesson.hint}
                  </summary>
                  <p className="mt-2 leading-snug">{card.hint}</p>
                </details>
                <p className="mt-3 hidden text-[0.8rem] leading-snug text-muted print:block">
                  <span className="font-semibold text-ink">{dict.lesson.hint}:</span> {card.hint}
                </p>

                {card.answer && (
                  <>
                    <details className="group mt-2 print:hidden">
                      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-btn bg-mint-soft px-3 text-[0.86rem] font-semibold select-none hover:bg-mint [&::-webkit-details-marker]:hidden">
                        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 4 4 4-4 4" />
                        </svg>
                        {dict.lesson.showAnswer}
                      </summary>
                      <p className="tabular mt-2 font-mono text-[1.1rem] font-medium">{card.answer}</p>
                    </details>
                    <p className="mt-auto hidden rotate-180 pt-4 text-right text-[0.75rem] text-muted print:block">
                      {dict.lesson.answer}: <span className="font-semibold text-ink">{card.answer}</span>
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Difficulty({ level, label }: { level: 1 | 2 | 3; label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="flex gap-0.5">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-1.5 w-3.5 rounded-full ${n <= level ? "bg-ink" : "bg-line"}`} />
      ))}
    </span>
  );
}
