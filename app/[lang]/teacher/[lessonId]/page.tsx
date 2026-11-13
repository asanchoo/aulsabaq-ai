import { LessonView } from "@/components/LessonView";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DEMO_LESSON_ID, demoLesson } from "@/lib/demo";
import { getDict, isLocale } from "@/lib/i18n";

// Пока есть только демо-урок. Уроки из базы появятся в День 4 (Supabase).
export function generateStaticParams() {
  return [{ lessonId: DEMO_LESSON_ID }];
}

/**
 * Каркас страницы отдаётся сразу, а содержимое урока (зависит от lessonId в адресе)
 * подгружается внутри <Suspense>. В День 4 здесь будет запрос к базе — структура уже готова.
 */
export default function LessonPage({ params }: PageProps<"/[lang]/teacher/[lessonId]">) {
  return (
    <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-20 sm:px-6 lg:px-8 lg:pt-10 print:p-0">
      <Suspense fallback={<LessonSkeleton />}>
        <LessonContent params={params} />
      </Suspense>
    </main>
  );
}

function LessonSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-5 w-40 rounded-md bg-surface" />
      <div className="mt-8 h-12 w-72 rounded-md bg-surface" />
      <div className="mt-4 h-5 w-56 rounded-md bg-surface" />
      <div className="mt-12 h-[32rem] rounded-frame bg-surface" />
    </div>
  );
}

async function LessonContent({ params }: { params: PageProps<"/[lang]/teacher/[lessonId]">["params"] }) {
  const { lang, lessonId } = await params;
  if (!isLocale(lang) || lessonId !== DEMO_LESSON_ID) notFound();

  const dict = getDict(lang);
  const plan = demoLesson;
  return <LessonView plan={plan} lang={lang} dict={dict} badge={dict.lesson.demoBadge} />;
}
