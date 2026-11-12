import type { Metadata } from "next";
import { Golos_Text, Literata } from "next/font/google";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getDict, isLocale, locales } from "@/lib/i18n";
import "../globals.css";

// Оба шрифта поддерживают казахские буквы (ә, ғ, қ, ң, ө, ұ, ү, һ, і) — для этого cyrillic-ext.
const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  axes: ["opsz"],
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDict(lang);
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang} className={`${golos.variable} ${literata.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader lang={lang} dict={getDict(lang)} />
        {children}
      </body>
    </html>
  );
}
