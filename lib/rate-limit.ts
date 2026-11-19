import { rpc, storageConfigured } from "./db";

/**
 * Лимиты запросов по IP, бережём ключ модели и базу.
 * Счётчик хранится в базе (общий для всех экземпляров сервера на Vercel). Если базы нет
 * (локальный запуск без env) или она недоступна, работает счётчик в памяти процесса.
 *
 * Важно для сельской школы: все ученики одного класса выходят в интернет через один IP,
 * поэтому лимиты на подсказки и ответы рассчитаны на целый класс, а не на одного человека.
 */
export const LIMITS = {
  lesson: { limit: 10, windowSec: 3600 },
  card: { limit: 30, windowSec: 3600 },
  demo: { limit: 30, windowSec: 3600 },
  join: { limit: 120, windowSec: 3600 },
  hint: { limit: 400, windowSec: 3600 },
  student: { limit: 3000, windowSec: 3600 },
  teacher: { limit: 3000, windowSec: 3600 },
} as const;

export type LimitBucket = keyof typeof LIMITS;

export function createRateLimiter(limit = 10, windowMs = 3_600_000) {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (key: string, now = Date.now()): number => {
    for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
    const bucket = buckets.get(key) ?? { count: 0, expires: now + windowMs };
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.count++;
    buckets.set(key, bucket);
    return 0;
  };
}

const memory = Object.fromEntries(
  Object.entries(LIMITS).map(([name, { limit, windowSec }]) => [name, createRateLimiter(limit, windowSec * 1000)]),
) as Record<LimitBucket, ReturnType<typeof createRateLimiter>>;

/**
 * Лимиты временно выключены по решению автора (тестирование с учителями из одной школы).
 * Включить обратно: RATE_LIMITS=on в env Vercel. Без лимита ключ модели может тратить любой посетитель;
 * на бесплатном тарифе Gemini это не деньги, а риск упереться в квоту.
 */
export const rateLimitsEnabled = (env: Record<string, string | undefined> = process.env) => env.RATE_LIMITS === "on";

/**
 * Общий предел на весь сайт за сутки для запросов к платной модели. Работает всегда, даже когда лимиты по IP
 * выключены: один человек со скриптом не потратит кредиты OpenAI и не выключит сайт в дни проверки.
 * Значения с запасом на настоящую работу (десятки учителей в день); поменять можно в env:
 * DAILY_LESSON_CAP, DAILY_CARD_CAP, DAILY_HINT_CAP.
 */
export const DAILY_CAPS = { lesson: 150, card: 400, hint: 5000 } as const;
export type DailyBucket = keyof typeof DAILY_CAPS;

export function dailyCap(bucket: DailyBucket, env: Record<string, string | undefined> = process.env): number {
  const fromEnv = Number(env[`DAILY_${bucket.toUpperCase()}_CAP`]);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DAILY_CAPS[bucket];
}

const dailyMemory = Object.fromEntries(
  (Object.keys(DAILY_CAPS) as DailyBucket[]).map((name) => [name, createRateLimiter(dailyCap(name), 86_400_000)]),
) as Record<DailyBucket, ReturnType<typeof createRateLimiter>>;

/** 0 — можно; иначе через сколько секунд сутки закончатся. Счётчик в базе общий для всех серверов. */
export async function checkDailyCap(bucket: DailyBucket): Promise<number> {
  if (storageConfigured()) {
    try {
      return await rpc<number>("hit_rate_limit", { p_key: `daily:${bucket}`, p_limit: dailyCap(bucket), p_window_seconds: 86_400 });
    } catch {
      // база недоступна: считаем в памяти этого сервера
    }
  }
  return dailyMemory[bucket]("site");
}

export function dailyLimited(retryAfter: number): Response {
  return Response.json({ error: "daily_limit" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

/** 0 — можно; иначе через сколько секунд повторить. */
export async function checkLimit(bucket: LimitBucket, ip: string): Promise<number> {
  if (!rateLimitsEnabled()) return 0;
  if (storageConfigured()) {
    try {
      const { limit, windowSec } = LIMITS[bucket];
      return await rpc<number>("hit_rate_limit", { p_key: `${bucket}:${ip}`, p_limit: limit, p_window_seconds: windowSec });
    } catch {
      // база недоступна: не блокируем учителя, считаем в памяти
    }
  }
  return memory[bucket](ip);
}

/** IP клиента. Доверяем только заголовку платформы Vercel; локально — общий ключ. */
export function clientIp(request: Request): string {
  return process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") ?? "unknown" : "local";
}

export function limited(retryAfter: number): Response {
  return Response.json({ error: "rate_limit" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
