import { notFound } from "next/navigation";
import { LessonPreview } from "@/components/LessonPreview";
import { isLocale } from "@/lib/i18n";

export default async function PreviewPage({ params }: PageProps<"/[lang]/teacher/preview">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-20 sm:px-6 lg:px-8 lg:pt-10 print:p-0"><LessonPreview lang={lang} /></main>;
}
