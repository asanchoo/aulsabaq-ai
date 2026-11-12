import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonScore, ModeLegend } from "@/components/LessonScore";
import { DEMO_LESSON_ID, demoLesson } from "@/lib/demo";
import { getDict, isLocale } from "@/lib/i18n";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDict(lang);

  return (
    <main className="flex-1">
      {/* --- Первый экран --- */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="flex items-center gap-3 text-[0.8rem] font-semibold tracking-[0.06em] text-margin uppercase">
            <span aria-hidden className="h-px w-8 bg-margin" />
            {dict.hero.eyebrow}
          </p>
          <h1 className="mt-6 font-serif text-[2.5rem] leading-[1.04] font-medium tracking-[-0.02em] text-balance text-ink sm:text-[3.6rem]">
            {dict.hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-[1.06rem] leading-relaxed text-pretty text-ink-soft">{dict.hero.lead}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/${lang}/teacher/${DEMO_LESSON_ID}`}
              className="group inline-flex h-12 items-center whitespace-nowrap justify-center gap-2 rounded-full bg-ink px-6 text-[0.95rem] font-medium text-paper transition-colors hover:bg-blue-deep"
            >
              {dict.hero.ctaDemo}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <span
              aria-disabled
              className="inline-flex h-12 cursor-not-allowed items-center whitespace-nowrap justify-center gap-2 rounded-full border border-dashed border-ink-faint/60 px-6 text-[0.95rem] font-medium text-ink-faint"
            >
              {dict.hero.ctaCreate}
              <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[0.7rem] text-ink-soft">{dict.hero.soon}</span>
            </span>
          </div>
          <p className="mt-4 text-[0.82rem] text-ink-faint">{dict.hero.noSignup}</p>
        </div>

        {/* Тетрадный лист с настоящим уроком */}
        <div className="relative overflow-hidden rounded-sheet border border-rule bg-notebook py-5 pr-5 pl-11 shadow-[0_24px_48px_-28px_rgba(27,29,36,0.35)] sm:py-6 sm:pr-7 sm:pl-14">
          <span aria-hidden className="absolute inset-y-0 left-7 w-px bg-margin/70 sm:left-9" />
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="font-serif text-lg font-medium text-ink">{dict.score.title}</h2>
            <ModeLegend dict={dict} />
          </div>
          <LessonScore plan={demoLesson} dict={dict} showActivity={demoLesson.language === lang} />
          <p className="mt-4 text-[0.78rem] text-ink-faint italic">{dict.score.hint}</p>
        </div>
      </section>

      {/* --- Цифры --- */}
      <section aria-labelledby="facts" className="border-y border-rule bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="facts" className="sr-only">
            {dict.facts.title}
          </h2>
          <dl className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {dict.facts.items.map((f) => (
              <div key={f.label} className="sm:border-l sm:border-rule sm:pl-6 first:sm:border-l-0 first:sm:pl-0">
                <dt className="sr-only">{f.label}</dt>
                <dd className="font-serif text-[3rem] leading-none font-medium tracking-tight text-ink tabular">
                  {f.value}
                </dd>
                <dd className="mt-3 max-w-[16rem] text-[0.92rem] leading-snug text-ink-soft">
                  {f.label}
                  <a href="#sources" className="ml-0.5 align-super text-[0.65rem] text-margin hover:underline">
                    [{f.source}]
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --- Как это работает --- */}
      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="how" className="font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          {dict.how.title}
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {dict.how.steps.map((step, i) => (
            <li key={step.title} className="border-t-2 border-ink pt-5">
              <span className="font-serif text-[2rem] leading-none text-margin italic">{i + 1}.</span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Подсказка, а не ответ --- */}
      <section aria-labelledby="hint" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="grid items-center gap-10 rounded-sheet bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14 md:grid-cols-2 md:gap-14">
          <div>
            <h2 id="hint" className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              {dict.hint.title}
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-paper/75">{dict.hint.text}</p>
          </div>
          <div className="rounded-sheet bg-card p-5 text-ink shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] sm:p-6">
            <p className="font-serif text-2xl font-medium tabular">{dict.hint.task}</p>
            <div className="mt-5 space-y-3 text-[0.95rem]">
              <p className="flex gap-3">
                <span className="w-20 shrink-0 text-[0.75rem] font-semibold tracking-wide text-ink-faint uppercase">
                  {dict.hint.studentLabel}
                </span>
                <span>{dict.hint.student}</span>
              </p>
              <p className="flex gap-3">
                <span className="w-20 shrink-0 text-[0.75rem] font-semibold tracking-wide text-blue uppercase">
                  {dict.hint.helperLabel}
                </span>
                <span className="font-serif text-[1.05rem] leading-snug text-blue italic">{dict.hint.reply}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Подвал --- */}
      <footer id="sources" className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[0.82rem] text-ink-soft sm:flex-row sm:justify-between sm:px-6">
          <p>{dict.footer.project}</p>
          <div>
            <p className="font-semibold text-ink">{dict.footer.sourcesTitle}</p>
            <ol className="mt-2 space-y-1">
              {dict.footer.sources.map((s, i) => (
                <li key={s.href}>
                  <span className="text-margin">[{i + 1}]</span>{" "}
                  <a href={s.href} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-2 hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </footer>
    </main>
  );
}
