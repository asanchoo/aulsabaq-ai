import Link from "next/link";
import { notFound } from "next/navigation";
import { CountUp } from "@/components/CountUp";
import { HintChat } from "@/components/HintChat";
import { LessonScore, ModeLegend } from "@/components/LessonScore";
import { Reveal } from "@/components/Reveal";
import { LogoMark } from "@/components/Logo";
import { HeroDemo } from "@/components/HeroDemo";
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
        <div className="wrap grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-12 lg:items-stretch lg:gap-x-6">
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

          <HeroDemo dict={dict} className="enter-late relative grid content-center justify-items-center overflow-hidden rounded-frame bg-stage py-8 lg:col-span-6 lg:col-start-7 lg:min-h-[600px] lg:place-items-center lg:py-0 xl:justify-items-end xl:pr-16" />
        </div>
      </section>

      {/* --- Как это работает: настоящий урок, который можно прокрутить по минутам --- */}
      <section id="how" aria-labelledby="how-h" className="scroll-mt-16 py-20 lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <h2 id="how-h" className="display text-[1.75rem] min-[360px]:text-[2.2rem] sm:text-[2.8rem] lg:text-[3.2rem]">
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

          {/* Окно приложения с настоящим демо-уроком: курсор сам идёт по минутам, пока его не тронут */}
          <Reveal className="lg:col-span-6 lg:col-start-7">
            <div className="overflow-hidden rounded-frame border border-line bg-white shadow-[0_30px_70px_-40px_rgb(0_0_0/0.35)]">
              <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
                <span aria-hidden className="flex gap-1.5">
                  <i className="size-2.5 rounded-full bg-line-strong" />
                  <i className="size-2.5 rounded-full bg-line-strong" />
                  <i className="size-2.5 rounded-full bg-line-strong" />
                </span>
                <span className="truncate text-[0.8rem] text-muted">AulSabaq · {dict.score.title}</span>
              </div>
              <div className="p-5 sm:p-7">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <p className="text-[0.88rem] text-muted">{dict.score.hint}</p>
                  <ModeLegend dict={dict} />
                </div>
                <LessonScore plan={demoLesson} dict={dict} showActivity={demoLesson.language === lang} autoplay />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Для учеников: тёмная полоса, одна на странице --- */}
      <section id="students" aria-labelledby="students-h" className="scroll-mt-16 bg-ink py-20 text-white lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <p className="mb-5 inline-flex rounded-full bg-white/10 px-3 py-1 text-[0.8rem] font-semibold text-mint">{dict.students.soon}</p>
            <h2 id="students-h" className="display text-[1.75rem] min-[360px]:text-[2.2rem] sm:text-[2.8rem] lg:text-[3.2rem]">
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
            <p className="mt-8 max-w-[30rem] border-t border-white/15 pt-5 text-[0.95rem] leading-relaxed text-white/70">{dict.students.now}</p>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            <HintChat dict={dict} />
          </div>
        </div>
      </section>

      {/* --- Почему это важно --- */}
      <section id="why" aria-labelledby="why-h" className="py-20 lg:min-h-svh lg:pt-[120px] lg:pb-24">
        <div className="wrap">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-12 lg:gap-x-6">
          <h2 id="why-h" className="display text-[1.75rem] min-[360px]:text-[2.2rem] sm:text-[2.8rem] lg:col-span-7 lg:text-[3.2rem]">
            {dict.why.title}
          </h2>
          <p className="max-w-[30rem] text-[1.05rem] leading-relaxed text-ink/85 lg:col-span-5 lg:col-start-8">{dict.why.lead}</p>
        </div>
        <dl className="mt-14 grid gap-10 border-t border-line pt-10 sm:grid-cols-3 sm:gap-8 lg:mt-20">
          {dict.why.items.map((f) => (
            <div key={f.label}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="text-[3.5rem] leading-none font-medium tracking-[-0.04em] lg:text-[4.5rem]">
                <CountUp value={f.value} suffix={f.suffix} locale={lang} />
              </dd>
              <dd className="mt-4 max-w-[18rem] leading-snug text-muted">{f.label}</dd>
            </div>
          ))}
        </dl>
        </div>
      </section>

      {/* --- Финал и подвал --- */}
      <footer className="closing bg-stage pt-20 pb-10 lg:flex lg:min-h-svh lg:pt-[120px]">
        <div className="wrap flex flex-col justify-between gap-16">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-6">
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

        {/* Карточки из демо-урока: так их получает учитель для печати */}
        <div aria-hidden className="relative hidden h-[420px] lg:col-span-5 lg:col-start-8 lg:block">
          {demoLesson.groups[0].cards.slice(0, 3).map((card, i) => (
            <Reveal
              key={card.id}
              delay={i * 140}
              className="absolute w-[64%] max-w-[300px] rounded-card bg-white p-5 shadow-[0_24px_50px_-28px_rgb(0_0_0/0.35)]"
              style={{ left: `${i * 18}%`, top: `${i * 22}%` }}
            >
              <p className="font-mono text-[0.75rem] text-muted">
                {t(dict.common.card, { n: i + 1 })} · {t(dict.common.gradeShort, { n: demoLesson.groups[0].grade })}
              </p>
              <p className="mt-2 text-[1.1rem] leading-snug font-medium">{card.prompt}</p>
              <div className="mt-4 grid gap-2.5">
                <i className="h-px bg-line" />
                <i className="h-px bg-line" />
              </div>
            </Reveal>
          ))}
        </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-ink/10 pt-8 text-[0.9rem] text-ink/75 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/${lang}`} aria-label={dict.nav.home} className="inline-flex min-h-11 items-center gap-2.5 text-ink">
              <LogoMark />
              <span className="text-[1.1rem] font-semibold tracking-[-0.03em]">AulSabaq</span>
            </Link>
            <span>{dict.closing.tagline}</span>
          </div>
          <nav aria-label={dict.nav.how} className="flex flex-wrap gap-x-6 gap-y-1">
            <Link className="link py-2" href={`/${lang}#how`}>{dict.nav.how}</Link>
            <Link className="link py-2" href={`/${lang}#students`}>{dict.nav.students}</Link>
            <Link className="link py-2" href={demo}>{dict.nav.demo}</Link>
          </nav>
          <span>{dict.closing.rights}</span>
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
