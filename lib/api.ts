import { StorageError } from "./db";

/**
 * Общие помощники API-роутов: чтение тела с ограничением размера и единый формат ошибок.
 * Ошибка всегда { error: "<код>" }: клиент показывает понятный текст по коду из словаря.
 */

export function fail(error: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers });
}

/** JSON из тела запроса или Response с ошибкой (слишком большое тело, не JSON). */
export async function readJson(request: Request, maxBytes = 8192): Promise<unknown | Response> {
  if (Number(request.headers.get("content-length")) > maxBytes) return fail("bad_request", 413);
  try {
    const text = await request.text();
    if (text.length > maxBytes) return fail("bad_request", 413);
    return JSON.parse(text);
  } catch {
    return fail("bad_request", 400);
  }
}

export const teacherToken = (request: Request) => request.headers.get("x-teacher-token")?.trim() ?? "";

/** Сбой базы: 503, чтобы клиент сказал «попробуйте ещё раз», а не «урок не найден». */
export function storageFailure(error: unknown): Response {
  if (error instanceof StorageError) {
    if (error.message === "not_configured") return fail("not_configured", 503);
    if (error.message === "too_many_students") return fail("too_many_students", 409);
    return fail("storage", 503);
  }
  throw error;
}
