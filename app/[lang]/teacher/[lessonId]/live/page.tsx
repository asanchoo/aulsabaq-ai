import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { LiveLesson } from "@/components/LiveLesson";

export default function Page({
  params,
}: PageProps<"/[lang]/teacher/[lessonId]/live">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <Content params={params} />
    </Suspense>
  );
}
async function Content({
  params,
}: {
  params: PageProps<"/[lang]/teacher/[lessonId]/live">["params"];
}) {
  const { lang, lessonId } = await params;
  if (!isLocale(lang)) notFound();
  return <LiveLesson lessonId={lessonId} lang={lang} />;
}
