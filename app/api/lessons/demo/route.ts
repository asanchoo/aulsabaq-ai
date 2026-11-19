import { storageFailure } from "@/lib/api";
import { demoFor } from "@/lib/demo";
import { defaultLocale, isLocale } from "@/lib/i18n";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { saveLesson } from "@/lib/store";

/**
 * POST: своя копия демо-урока с кодом для учеников, без вызова модели.
 * У каждого, кто нажал, отдельный урок: рецензенты не видят учеников друг друга.
 * ?lang=kk даёт казахский демо-урок, без параметра или с неизвестным языком русский.
 */
export async function POST(request: Request) {
  const retryAfter = await checkLimit("demo", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  try {
    const lang = new URL(request.url).searchParams.get("lang") ?? "";
    return Response.json(await saveLesson(demoFor(isLocale(lang) ? lang : defaultLocale), true));
  } catch (error) {
    return storageFailure(error);
  }
}
