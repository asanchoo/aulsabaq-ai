import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLive } from "@/components/DemoLive";
import { LessonView } from "@/components/LessonView";
import { TeacherWorkspace } from "@/components/TeacherWorkspace";
import { storageConfigured } from "@/lib/db";
import { DEMO_LESSON_ID, demoLesson } from "@/lib/demo";
import { getCreationDict, getDict, isLocale } from "@/lib/i18n";
import { getLesson, isUuid } from "@/lib/store";

// Демо-урок собирается при сборке; уроки учителей читаются из базы при каждом открытии.
export function generateStaticParams() {
  return [{ lessonId: DEMO_LESSON_ID }];
}

/**
 * Каркас страницы отдаётся сразу, а урок (зависит от lessonId в адресе) подгружается внутри <Suspense>.
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
      <div className="mt-8 h-12 w-72 max-w-full rounded-md bg-surface" />
      <div className="mt-4 h-5 w-56 max-w-full rounded-md bg-surface" />
      <div className="mt-12 h-[32rem] rounded-frame bg-surface" />
    </div>
  );
}

async function LessonContent({ params }: { params: PageProps<"/[lang]/teacher/[lessonId]">["params"] }) {
  const { lang, lessonId } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDict(lang);

  if (lessonId === DEMO_LESSON_ID) {
    return (
      <LessonView
        plan={demoLesson}
        lang={lang}
        dict={dict}
        badge={dict.lesson.demoBadge}
        workspace={storageConfigured() ? <DemoLive lang={lang} plan={demoLesson} /> : undefined}
      />
    );
  }

  if (!isUuid(lessonId) || !storageConfigured()) notFound();
  // Урок из базы читаем только при настоящем запросе. Без этого Next.js при сборке оболочки страницы
  // начинал запрос к базе и обрывал его, а в логах это выглядело как сбой базы.
  await connection();
  let lesson;
  try {
    lesson = await getLesson(lessonId);
  } catch {
    return <p role="alert" className="max-w-xl py-16 text-[1.1rem]">{dict.teacher.loadError}</p>;
  }
  if (!lesson) notFound();

  return (
    <LessonView
      plan={lesson.plan}
      lang={lang}
      dict={dict}
      badge={lesson.isDemo ? dict.lesson.demoBadge : getCreationDict(lang).preview}
      notice={lesson.isDemo ? undefined : getCreationDict(lang).review}
      joinCode={lesson.joinCode}
      workspace={<TeacherWorkspace lessonId={lesson.id} joinCode={lesson.joinCode} plan={lesson.plan} lang={lang} isDemo={lesson.isDemo} />}
    />
  );
}
