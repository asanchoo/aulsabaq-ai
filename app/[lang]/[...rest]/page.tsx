import { notFound } from "next/navigation";

// Этот адрес всегда «не найден»: проверять, откроется ли он мгновенно, незачем.
export const instant = false;

/**
 * Любой адрес, для которого нет страницы (/ru/teacher, /kk/опечатка), попадает сюда и показывает
 * «Такой страницы нет» из app/[lang]/not-found.tsx: на языке адреса и с шапкой сайта, а не английскую заглушку Next.js.
 */
export default function UnknownPage() {
  notFound();
}
