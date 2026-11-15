import { ExplanationSlides } from "./ExplanationSlides";
import { t, type Dict } from "@/lib/i18n";
import type { Group } from "@/lib/schema";

/**
 * Объяснение новой темы для каждого класса: то, что учитель говорит и показывает
 * на этапе «с учителем». Слева сама тема (с чего начать, правило, шаги),
 * справа разбор примера, ошибки и вопросы классу. Кнопка открывает то же самое слайдами.
 */
export function TopicExplanation({ groups, dict }: { groups: Group[]; dict: Dict }) {
  const l = dict.lesson;
  return (
    <div className="grid gap-8">
      {groups.map((g) => {
        const grade = t(dict.common.grade, { n: g.grade });
        const e = g.explanation;
        return (
          <article key={g.id} aria-labelledby={`explain-${g.id}`} className="rounded-frame border border-line bg-white p-5 sm:p-8">
            <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h3 id={`explain-${g.id}`} className="text-[1.5rem] font-semibold tracking-[-0.02em]">
                  {grade}
                </h3>
                <p className="mt-1 font-medium">{g.topic}</p>
              </div>
              <ExplanationSlides
                explanation={e}
                grade={grade}
                topic={g.topic}
                labels={{
                  open: l.present,
                  label: t(l.slides.label, { topic: g.topic }),
                  prev: l.slides.prev,
                  next: l.slides.next,
                  close: l.slides.close,
                  counter: l.slides.counter,
                  keys: l.slides.keys,
                  answer: l.answer,
                  explain: l.explain,
                }}
              />
            </header>

            <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-12">
              <div className="grid content-start gap-6 lg:col-span-7">
                <Block title={l.explain.hook}>
                  <p className="max-w-[65ch] leading-[1.6]">{e.hook}</p>
                </Block>
                <div className="rounded-card bg-mint-soft p-5">
                  <h4 className="text-[0.82rem] font-semibold tracking-[0.02em] text-muted uppercase">{l.explain.keyIdea}</h4>
                  <p className="mt-2 text-[1.2rem] leading-[1.45] font-semibold tracking-[-0.01em]">{e.keyIdea}</p>
                </div>
                <Block title={l.explain.steps}>
                  <Numbered items={e.steps} />
                </Block>
              </div>

              <div className="grid content-start gap-6 lg:col-span-5">
                <div className="rounded-card bg-surface p-5">
                  <h4 className="text-[0.82rem] font-semibold tracking-[0.02em] text-muted uppercase">{l.explain.example}</h4>
                  <p className="tabular mt-2 font-mono text-[1.3rem] font-medium">{e.example.problem}</p>
                  <div className="mt-3">
                    <Numbered items={e.example.steps} />
                  </div>
                  <p className="mt-4 font-semibold">
                    {l.answer}: <span className="tabular font-mono">{e.example.answer}</span>
                  </p>
                </div>
                <Block title={l.explain.mistakes}>
                  <Bullets items={e.mistakes} />
                </Block>
                <Block title={l.explain.checkQuestions}>
                  <Bullets items={e.checkQuestions} />
                </Block>
              </div>
            </div>

            <p className="mt-8 border-t border-line pt-5 leading-[1.6]">
              <span className="font-semibold">{l.homework}:</span> {g.homework}
            </p>
          </article>
        );
      })}
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
