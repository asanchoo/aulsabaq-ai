import { Suspense } from "react";
import { notFound } from "next/navigation";
import { JoinFlow } from "@/components/JoinFlow";
import { isLocale } from "@/lib/i18n";

/** Вход ученика на урок по коду. Код можно передать в адресе: /ru/join?code=123456. */
export default async function JoinPage({ params }: PageProps<"/[lang]/join">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <main id="main" className="w-full flex-1 px-4 pt-10 pb-20 sm:px-6 lg:pt-16">
      {/* JoinFlow читает ?code= из адреса: это известно только при запросе, поэтому внутри Suspense. */}
      <Suspense fallback={null}>
        <JoinFlow lang={lang} />
      </Suspense>
    </main>
  );
}
