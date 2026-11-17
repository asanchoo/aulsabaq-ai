/**
 * Доступ к базе Supabase: только вызовы функций (RPC) через HTTP, без SDK.
 * Таблицы закрыты, каждая функция сама проверяет права (см. supabase/schema.sql).
 * Адрес и ключ читаются из env на сервере; в браузер они не попадают.
 */

export class StorageError extends Error {
  constructor(public status: number, message = "storage") { super(message); }
}

type Env = Record<string, string | undefined>;

export function storageConfig(env: Env = process.env): { url: string; key: string } | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = env.SUPABASE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export const storageConfigured = (env: Env = process.env) => storageConfig(env) !== null;

/** Вызов функции базы. Ошибку сети или базы превращаем в StorageError, текст ошибки в лог не пишем целиком. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const config = storageConfig();
  if (!config) throw new StorageError(503, "not_configured");
  // Новый ключ (sb_publishable_…) передаётся только в apikey; старый JWT-ключ ещё и как Bearer.
  const headers: Record<string, string> = { apikey: config.key, "Content-Type": "application/json" };
  if (config.key.startsWith("eyJ")) headers.Authorization = `Bearer ${config.key}`;
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`[db] ${fn}: request failed (${error instanceof Error ? error.name : "unknown"})`);
    throw new StorageError(503);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[db] ${fn}: HTTP ${response.status} ${detail.slice(0, 200)}`);
    throw new StorageError(response.status, detail.includes("too many students") ? "too_many_students" : "storage");
  }
  return (await response.json()) as T;
}
