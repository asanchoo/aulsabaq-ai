"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";

/**
 * «Такой страницы нет» на языке адреса: старая ссылка на урок, опечатка в адресе, удалённая сессия.
 * notFound() не передаёт параметры, поэтому язык берём из адреса через useParams (это клиентский компонент).
 */
export default function NotFound() {
  const params = useParams<{ lang: string }>();
  const lang = isLocale(params.lang ?? "") ? (params.lang as "ru" | "kk") : "ru";
  const d = getDict(lang).notFound;
  return (
    <main id="main" className="mx-auto grid w-full max-w-[1280px] flex-1 content-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-[40rem]">
        <p className="tabular font-mono text-[0.9rem] text-muted">404</p>
        <h1 className="mt-3 text-[clamp(2.2rem,6vw,3.6rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">{d.title}</h1>
        <p className="mt-5 max-w-[52ch] text-[1.05rem] leading-relaxed text-muted">{d.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/${lang}/teacher/new`} className="btn btn-primary">
            {d.create}
          </Link>
          <Link href={`/${lang}`} className="btn btn-secondary">
            {d.home}
          </Link>
        </div>
        <Link href={`/${lang}/join`} className="link mt-6 inline-block py-2 text-[0.95rem] text-muted hover:text-ink">
          {d.join}
        </Link>
      </div>
    </main>
  );
}
