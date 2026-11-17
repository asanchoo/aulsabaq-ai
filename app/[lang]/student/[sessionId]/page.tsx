import { Suspense } from "react";
import { notFound } from "next/navigation";
import { StudentApp } from "@/components/StudentApp";
import { isLocale } from "@/lib/i18n";

/** Экран ученика: его карточки по одной, проверка ответа, подсказки, кнопка «Мне нужна помощь». */
export default function StudentPage({ params }: PageProps<"/[lang]/student/[sessionId]">) {
  return (
    <main id="main" className="w-full flex-1 px-4 pt-6 pb-20 sm:px-6 lg:pt-10">
      <Suspense fallback={null}>
        <StudentContent params={params} />
      </Suspense>
    </main>
  );
}

async function StudentContent({ params }: { params: PageProps<"/[lang]/student/[sessionId]">["params"] }) {
  const { lang, sessionId } = await params;
  if (!isLocale(lang)) notFound();
  return <StudentApp lang={lang} sessionId={sessionId} />;
}
