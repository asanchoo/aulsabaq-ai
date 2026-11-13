import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonScore, ModeLegend } from "@/components/LessonScore";
import { LogoMark } from "@/components/Logo";
import { StudentPhone } from "@/components/StudentPhone";
import { DEMO_LESSON_ID, demoLesson } from "@/lib/demo";
import { getDict, isLocale, t } from "@/lib/i18n";


export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDict(lang);
  const create = `/${lang}/teacher/new`;
  const demo = `/${lang}/teacher/${DEMO_LESSON_ID}`;

  return (
    <main id="main" className="flex-1">
      {/* --- Первый экран: обещание слева, экран ученика справа --- */}
      <section aria-labelledby="hero-h" className="pt-10 pb-16 lg:flex lg:min-h-[calc(100svh-72px)] lg:py-12">
        <div className="wrap grid gap-10 lg:grid-cols-12 lg:items-stretch lg:gap-x-6">
          <div className="enter lg:col-span-5">
            <p className="flex items-center gap-2 text-[0.85rem] text-muted">
              <span aria-hidden className="size-2 rounded-full bg-ink" />
              {dict.hero.kicker}
            </p>
            <h1 id="hero-h" className="display mt-5 text-[2.6rem] sm:text-[3.4rem] lg:text-[clamp(3rem,4.6vw,4.2rem)]">
              {dict.hero.title}
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.08rem] leading-relaxed text-pretty text-ink/85">{dict.hero.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={create} className="btn btn-primary">
                {dict.hero.ctaCreate}
                <Arrow />
              </Link>
              <Link href={demo} className="btn btn-secondary">
                {dict.hero.ctaDemo}
              </Link>
            </div>
            <p className="mt-5 text-[0.85rem] text-muted">{dict.hero.note}</p>
          </div>

          <div
            role="img"
            aria-label={dict.phone.label}
            className="enter-late relative grid justify-items-center overflow-hidden rounded-frame bg-stage py-8 lg:col-span-6 lg:col-start-7 lg:min-h-[600px] lg:place-items-center lg:py-0 xl:justify-items-end xl:pr-16"
          >
            <StudentPhone dict={dict} className="w-[240px] sm:w-[270px] lg:w-[290px]" />
            <div aria-hidden className="absolute bottom-6 left-6 hidden w-[236px] rounded-card border border-line bg-white p-4 xl:block">
              <div className="flex items-center justify-between text-[0.8rem] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#22c55e]" />
                  {dict.phone.live}
                </span>
                <span className="font-mono">{dict.phone.liveTime}</span>
              </div>
              <p className="mt-2 text-[0.95rem] leading-snug font-medium">{dict.phone.liveText}</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Как это работает: настоящий урок, который можно прокрутить по минутам --- */}
      <section id="how" aria-labelledby="how-h" className="scroll-mt-16 py-20 lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap grid gap-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <h2 id="how-h" className="display text-[2.2rem] sm:text-[2.8rem] lg:text-[3.2rem]">
              {dict.how.title}
            </h2>
            <p className="mt-5 max-w-[30rem] text-[1.05rem] leading-relaxed text-ink/85">{dict.how.lead}</p>
            <ol className="mt-10 grid gap-7">
              {dict.how.steps.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                  <span className="font-mono text-[0.9rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-[1.08rem] font-semibold">{step.title}</h3>
                    <p className="mt-1 leading-relaxed text-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-frame bg-surface p-5 sm:p-8 lg:col-span-6 lg:col-start-7 lg:p-10">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div>
                <p className="text-[1.1rem] font-semibold">{dict.score.title}</p>
                <p className="mt-1 text-[0.85rem] text-muted">{dict.score.hint}</p>
              </div>
              <ModeLegend dict={dict} />
            </div>
            <div className="rounded-card bg-white p-5 sm:p-6">
              <LessonScore plan={demoLesson} dict={dict} showActivity={demoLesson.language === lang} />
            </div>
          </div>
        </div>
      </section>

      {/* --- Для учеников: тёмная полоса, одна на странице --- */}
      <section id="students" aria-labelledby="students-h" className="scroll-mt-16 bg-ink py-20 text-white lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap grid gap-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <h2 id="students-h" className="display text-[2.2rem] sm:text-[2.8rem] lg:text-[3.2rem]">
              {dict.students.title}
            </h2>
            <p className="mt-5 max-w-[30rem] text-[1.05rem] leading-relaxed text-white/75">{dict.students.lead}</p>
            <ul className="mt-10 grid gap-5">
              {dict.students.rules.map((rule) => (
                <li key={rule} className="flex gap-3 leading-relaxed text-white/90">
                  <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mint text-ink">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden className="grid content-start gap-3 rounded-frame bg-white/[0.06] p-5 sm:p-8 lg:col-span-6 lg:col-start-7">
            <div className="rounded-card bg-white p-5 text-ink">
              <p className="text-[0.8rem] text-muted">{t(dict.common.card, { n: 2 })} · {t(dict.common.grade, { n: 2 })}</p>
              <p className="mt-1.5 text-[1.6rem] font-medium tracking-[-0.02em]">{dict.students.task}</p>
            </div>
            <p className="ml-auto max-w-[75%] rounded-card rounded-br-md bg-white/12 px-4 py-2.5 text-[0.95rem]">{dict.students.ask}</p>
            {dict.students.hints.map((hint, i) => (
              <div key={hint} className="max-w-[88%] rounded-card rounded-bl-md bg-mint px-4 py-3 text-ink">
                <small className="block text-[0.75rem] font-semibold text-[#3f5a4b]">{t(dict.students.hintLabel, { n: i + 1 })}</small>
                <p className="mt-0.5 text-[0.95rem] leading-snug">{hint}</p>
              </div>
            ))}
            <div className="mt-3 flex items-center gap-3 rounded-card bg-white p-4 text-ink">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-help-soft text-help">
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{dict.students.alertTitle}</p>
                <p className="text-[0.88rem] text-muted">{dict.students.alertText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Почему это важно: цифры с источниками --- */}
      <section id="why" aria-labelledby="why-h" className="py-20 lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap">
        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-x-6">
          <h2 id="why-h" className="display text-[2.2rem] sm:text-[2.8rem] lg:col-span-7 lg:text-[3.2rem]">
            {dict.why.title}
          </h2>
          <p className="max-w-[30rem] text-[1.05rem] leading-relaxed text-ink/85 lg:col-span-5 lg:col-start-8">{dict.why.lead}</p>
        </div>
        <dl className="mt-14 grid gap-10 border-t border-line pt-10 sm:grid-cols-3 sm:gap-8 lg:mt-20">
          {dict.why.items.map((f) => (
            <div key={f.label}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="tabular text-[3.5rem] leading-none font-medium tracking-[-0.04em] lg:text-[5rem]">{f.value}</dd>
              <dd className="mt-4 max-w-[18rem] leading-snug text-muted">
                {f.label}
                <a href="#sources" className="ml-1 align-super font-mono text-[0.7rem] text-ink hover:underline">
                  [{f.source}]
                </a>
              </dd>
            </div>
          ))}
        </dl>
        </div>
      </section>

      {/* --- Финал и подвал --- */}
      <footer className="closing bg-stage pt-20 pb-10 lg:flex lg:min-h-svh lg:pt-[120px]">
        <div className="wrap flex flex-col justify-between gap-16">
        <div>
          <h2 className="display max-w-[16ch] text-[2.2rem] sm:text-[2.8rem] lg:text-[3.6rem]">{dict.closing.title}</h2>
          <p className="mt-5 max-w-[34rem] text-[1.05rem] leading-relaxed text-ink/85">{dict.closing.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={create} className="btn btn-primary">
              {dict.hero.ctaCreate}
              <Arrow />
            </Link>
            <Link href={demo} className="btn btn-secondary">
              {dict.hero.ctaDemo}
            </Link>
          </div>
        </div>

        <div id="sources" className="grid gap-8 border-t border-ink/10 pt-10 text-[0.88rem] text-ink/75 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-4">
            <Link href={`/${lang}`} className="inline-flex min-h-11 items-center gap-2.5 text-ink">
              <LogoMark />
              <span className="text-[1.1rem] font-semibold tracking-[-0.03em]">AulSabaq</span>
            </Link>
            <p className="mt-2">{dict.closing.project}</p>
          </div>
          <nav aria-label={dict.nav.how} className="flex flex-col gap-1 lg:col-span-3">
            <Link className="link py-1.5" href={`/${lang}#how`}>{dict.nav.how}</Link>
            <Link className="link py-1.5" href={`/${lang}#students`}>{dict.nav.students}</Link>
            <Link className="link py-1.5" href={demo}>{dict.nav.demo}</Link>
            <Link className="link py-1.5" href={create}>{dict.nav.create}</Link>
          </nav>
          <div className="sm:col-span-2 lg:col-span-5">
            <p className="font-semibold text-ink">{dict.why.sourcesTitle}</p>
            <ol className="mt-2 grid gap-2">
              {dict.why.sources.map((s, i) => (
                <li key={s.href}>
                  <span className="font-mono text-ink">[{i + 1}]</span>{" "}
                  <a href={s.href} target="_blank" rel="noreferrer" className="link">
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
        </div>
      </footer>
    </main>
  );
}

function Arrow() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8h10M8.5 4l4 4-4 4" />
    </svg>
  );
}
