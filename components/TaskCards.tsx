import type { Group } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";

/**
 * Карточки для самостоятельной работы.
 * На экране ответ спрятан под «Показать ответ».
 * При печати ответ печатается вверх ногами внизу карточки — классический приём
 * для самопроверки: ученик решает, потом переворачивает лист.
 */
export function TaskCards({ groups, dict }: { groups: Group[]; dict: Dict }) {
  return (
    <div className={`grid gap-10 print:block ${groups.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"} md:gap-8`}>
      {groups.map((g) => (
        <section key={g.id} className="print:mb-6 print:break-after-page last:print:break-after-auto">
          <header className="border-b-2 border-ink pb-3">
            <h3 className="font-serif text-2xl font-medium text-ink">{t(dict.common.grade, { n: g.grade })}</h3>
            <p className="mt-1 font-medium text-ink">{g.topic}</p>
            <p className="mt-2 text-[0.88rem] leading-snug text-ink-soft">
              <span className="font-semibold text-ink-soft">{dict.lesson.goal}:</span> {g.learningGoal}
            </p>
          </header>

          <ol className="mt-4 space-y-3 print:grid print:grid-cols-2 print:gap-3 print:space-y-0">
            {g.cards.map((card, i) => (
              <li
                key={card.id}
                className="relative flex flex-col rounded-sheet border border-rule bg-card p-4 print:break-inside-avoid print:rounded-none print:border-dashed print:border-ink-faint"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-margin uppercase">
                    {t(dict.common.card, { n: i + 1 })}
                    <span className="ml-1.5 text-ink-faint print:hidden">· {t(dict.common.gradeShort, { n: g.grade })}</span>
                  </span>
                  <Difficulty level={card.difficulty} label={t(dict.lesson.difficulty, { n: card.difficulty })} />
                </div>

                <p className="mt-2.5 font-serif text-[1.12rem] leading-snug text-ink">{card.prompt}</p>
                {card.type === "open" && (
                  <p className="mt-1.5 text-[0.75rem] font-medium text-ink-faint">{dict.lesson.openTask}</p>
                )}
                <p className="mt-3 text-[0.84rem] leading-snug text-ink-soft">
                  <span className="font-semibold">{dict.lesson.criteria}:</span> {card.successCriteria}
                </p>

                {card.answer && (
                  <>
                    <details className="group mt-3 print:hidden">
                      <summary className="cursor-pointer list-none text-[0.82rem] font-medium text-blue select-none hover:text-blue-deep [&::-webkit-details-marker]:hidden">
                        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                        {dict.lesson.showAnswer}
                      </summary>
                      <p className="mt-1.5 font-serif text-lg text-ink tabular">{card.answer}</p>
                    </details>
                    <p className="mt-auto hidden rotate-180 pt-4 text-right text-[0.75rem] text-ink-soft print:block">
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
        <span key={n} className={`h-1.5 w-3 rounded-full ${n <= level ? "bg-ink" : "bg-rule"}`} />
      ))}
    </span>
  );
}
