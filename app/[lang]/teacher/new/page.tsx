import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/LessonForm";
import { RecentLessons } from "@/components/RecentLessons";
import { getCreationDict, isLocale } from "@/lib/i18n";

export default async function NewLessonPage({ params }: PageProps<"/[lang]/teacher/new">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = getCreationDict(lang);

  return (
    <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-8 pb-20 sm:px-6 lg:px-8 lg:pt-12">
      <Link href={`/${lang}`} className="link inline-flex min-h-11 items-center text-[0.9rem] text-muted hover:text-ink">
        ← {d.back}
      </Link>
      <header className="mt-4 mb-10 max-w-[40rem] lg:mb-14">
        <h1 className="display text-[2.4rem] sm:text-[3.2rem]">{d.title}</h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/85">{d.lead}</p>
      </header>
      <RecentLessons lang={lang} />
      <LessonForm lang={lang} />
    </main>
  );
}
