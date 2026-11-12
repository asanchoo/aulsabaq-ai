import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales, type Locale } from "@/lib/i18n";

/**
 * Если в адресе нет языка (/ или /teacher/demo), перенаправляем на /ru/... или /kk/...
 * Язык выбираем по настройкам браузера (заголовок Accept-Language).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;

  request.nextUrl.pathname = `/${pickLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

function pickLocale(request: NextRequest): Locale {
  const header = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return /(^|,)\s*kk\b/.test(header) ? "kk" : defaultLocale;
}

export const config = {
  // Не трогаем API, служебные файлы Next.js и файлы с расширением (иконки, картинки).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
