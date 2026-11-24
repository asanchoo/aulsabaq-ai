import { ExplanationDisclosure } from "./ExplanationDisclosure";
import { ExplanationSlides } from "./ExplanationSlides";
import { getDict, getLessonToolsDict, t, type Dict, type Locale } from "@/lib/i18n";
import type { Group, WorkedExample } from "@/lib/schema";
import { Visual } from "./Visual";
import { isMathOnly, groupTitle } from "@/lib/lesson";

/**
 * Объяснение новой темы для каждого класса: то, что учитель говорит и показывает
 * на этапе «с учителем». Слева сама тема (с чего начать, правило, шаги),
 * справа разбор примера, ошибки и вопросы классу. Кнопка открывает то же самое слайдами.
 */
export function TopicExplanation({ groups, dict, lang, joinCode }: { groups: Group[]; dict: Dict; lang: Locale; joinCode?: string }) {
  const l = dict.lesson;
  return (
    <div className="grid gap-8">
      {groups.map((g) => {
        const grade = groupTitle(groups, g, dict.common);
        const e = g.explanation;
        return (
          <article key={g.id} aria-labelledby={`explain-${g.id}`} className="rounded-frame border border-line bg-white p-5 sm:p-8">
            <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h3 id={`explain-${g.id}`} className="text-[1.5rem] font-semibold tracking-[-0.02em]">
                  {grade}
                </h3>
                <p className="mt-1 font-medium">{g.topic}</p>
                {g.source && (
                  <p className="mt-1 text-[0.9rem] text-muted">
                    {l.source}
                    {g.source.pages ? `: ${t(l.sourcePages, { pages: g.source.pages })}` : ""}
                    {g.source.photos ? ` · ${t(l.sourcePhotos, { n: g.source.photos })}` : ""}
                  </p>
                )}
              </div>
              {/* Слайды видит класс: у класса со своим языком (урок на двух языках) подписи на его языке. */}
              <ExplanationSlides
                explanation={e}
                grade={g.language ? groupTitle(groups, g, getDict(g.language).common) : grade}
                topic={g.topic}
                lang={g.language ?? lang}
                joinCode={joinCode}
              />
            </header>

            <ExplanationDisclosure label={getLessonToolsDict(lang).expand}>
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-12">
              <div className="grid content-start gap-6 lg:col-span-7">
                <Block title={l.explain.hook}>
                  <p className="max-w-[65ch] leading-[1.6]">{e.hook}</p>
                </Block>
                {e.prerequisites.length > 0 && (
                  <Block title={l.explain.prerequisites}>
                    <Bullets items={e.prerequisites} />
                  </Block>
                )}
                {e.intuition && (
                  <Block title={l.explain.intuition}>
                    <p className="max-w-[65ch] leading-[1.6]">{e.intuition}</p>
                  </Block>
                )}
                {e.terms.length > 0 && (
                  <Block title={l.explain.terms}>
                    <dl className="grid gap-2">
                      {e.terms.map((x) => (
                        <div key={x.term} className="leading-[1.5]">
                          <dt className="inline font-semibold">{x.term}: </dt>
                          <dd className="inline">{x.meaning}</dd>
                        </div>
                      ))}
                    </dl>
                  </Block>
                )}
                <div className="rounded-card bg-mint-soft p-5">
                  <h4 className="text-[0.82rem] font-semibold tracking-[0.02em] text-muted uppercase">{l.explain.keyIdea}</h4>
                  <p className="mt-2 text-[1.2rem] leading-[1.45] font-semibold tracking-[-0.01em]">{e.keyIdea}</p>
                </div>
                {e.visuals.map((v, i) => (
                  <div key={i} className="rounded-card border border-line p-4 sm:p-5">
                    <Visual visual={v} labels={dict.visual} />
                  </div>
                ))}
                <Block title={l.explain.steps}>
                  <Numbered items={e.steps} />
                </Block>
              </div>

              <div className="grid content-start gap-6 lg:col-span-5">
                {[e.example, ...e.examples].map((x, i) => (
                  <Example key={i} example={x} title={`${t(l.explain.examples, { n: i + 1 })}${x.level ? `: ${l.explain.levels[x.level]}` : ""}`} dict={dict} />
                ))}
                {e.practice.length > 0 && (
                  <Block title={l.explain.practice}>
                    <ol className="grid gap-2">
                      {e.practice.map((p, i) => (
                        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 leading-[1.5]">
                          <span className="min-w-0">{i + 1}. {p.task}</span>
                          <span className="tabular rounded-btn bg-surface px-2 font-mono text-[0.9rem]">{l.answer}: {p.answer}</span>
                        </li>
                      ))}
                    </ol>
                  </Block>
                )}
                <Block title={l.explain.mistakes}>
                  <Bullets items={e.mistakes} />
                </Block>
                {e.summary.length > 0 && (
                  <Block title={l.explain.summary}>
                    <Bullets items={e.summary} />
                  </Block>
                )}
                <Block title={l.explain.checkQuestions}>
                  <Bullets items={e.checkQuestions} />
                </Block>
              </div>
            </div>

            <p className="mt-8 border-t border-line pt-5 leading-[1.6]">
              <span className="font-semibold">{l.homework}:</span> {g.homework}
            </p>
            </ExplanationDisclosure>
          </article>
        );
      })}
    </div>
  );
}

function Example({ example: x, title, dict }: { example: WorkedExample; title: string; dict: Dict }) {
  return (
    <div className="rounded-card bg-surface p-5">
      <h4 className="text-[0.82rem] font-semibold tracking-[0.02em] text-muted uppercase">{title}</h4>
      <p className={`tabular mt-2 font-medium ${isMathOnly(x.problem) ? "font-mono text-[1.3rem]" : "text-[1.1rem] leading-snug"}`}>{x.problem}</p>
      <div className="mt-3">
        <Numbered items={x.steps} />
      </div>
      <p className="mt-4 font-semibold">
        {dict.lesson.answer}: <span className="tabular font-mono">{x.answer}</span>
      </p>
      {x.visual && (
        <div className="mt-4 rounded-card bg-white p-4">
          <Visual visual={x.visual} labels={dict.visual} />
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[0.82rem] font-semibold tracking-[0.02em] text-muted uppercase">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Numbered({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-[1.5]">
          <span className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white text-[0.78rem] font-semibold ring-1 ring-line-strong">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-[1.5]">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
