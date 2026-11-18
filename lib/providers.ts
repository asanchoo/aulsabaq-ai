import { z } from "zod";

/**
 * Провайдеры модели: только HTTP-запрос и извлечение текста ответа.
 * Что такое урок и как его проверять, здесь не знают: это делает lib/ai.ts.
 * Ключи и модели читаются из env на сервере и никогда не попадают в клиент.
 */

export type ProviderName = "openai" | "gemini";

export type ProviderImage = { label: string; mimeType: string; data: string };

export type ProviderRequest = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Фото страниц учебника: идут после текста запроса, у каждого подпись («Группа 1, фото 1»). */
  images?: ProviderImage[];
};

/** Текст ответа или null, если модель не закончила (отказ, обрыв по длине, блокировка). */
export type Provider = { name: ProviderName; call(req: ProviderRequest): Promise<string | null> };

/** transient: временный сбой (перегрузка, лимит, таймаут), тот же запрос может пройти у другой модели. */
export class ProviderError extends Error {
  constructor(public transient = false) { super("provider"); }
}

// Один ответ модели — до полутора минут (объяснение со слайдами и фото страниц пишется дольше);
// lib/ai.ts не начинает повторы под конец, чтобы урок уложился в maxDuration роута (300 секунд).
const TIMEOUT_MS = 90_000;

/**
 * Какого провайдера использовать. AI_PROVIDER задаёт его явно; если не задан,
 * берём того, чей ключ и модель заполнены (сначала OpenAI, потом Gemini).
 * Нет ни одного: null, и API честно отвечает «не подключено».
 */
export function resolveProvider(env: Record<string, string | undefined> = process.env): Provider | null {
  const openai = env.OPENAI_API_KEY && env.OPENAI_MODEL ? openaiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL) : null;
  // GEMINI_MODEL может перечислять запасные модели через запятую: «gemini-3.5-flash-lite,gemini-3.1-flash-lite».
  const geminiModels = (env.GEMINI_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const gemini = env.GEMINI_API_KEY && geminiModels.length ? geminiProvider(env.GEMINI_API_KEY, geminiModels) : null;
  const choice = env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === "openai") return openai;
  if (choice === "gemini") return gemini;
  if (choice) return null; // опечатка в AI_PROVIDER не должна тихо выбрать другого провайдера
  return openai ?? gemini;
}

/**
 * Временные ошибки провайдера: перегрузка (503 «high demand» у Gemini бывает часто), лимит (429), сбой (500, 504).
 * Такой запрос повторяем с паузой; ошибки в самом запросе (400, 401, 404) не повторяем: повтор не поможет.
 * Паузы вынесены в объект, чтобы тесты могли их обнулить.
 */
const TRANSIENT = new Set([429, 500, 503, 504]);
// Два коротких повтора; если модель перегружена дольше, Gemini переходит к запасной модели (у неё своя квота).
export const retryTiming = { delaysMs: [2000, 6000] };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * В логи Vercel пишем только причину сбоя: тип ошибки, HTTP-код и сообщение провайдера.
 * Ни ключа, ни текста запроса и ответа там не будет.
 */
async function post(name: ProviderName, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  for (let retry = 0; ; retry++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Таймаут или обрыв сети: временный сбой, запасная модель может ответить.
      console.error(`[ai] ${name}: request failed (${error instanceof Error ? error.name : "unknown"})`);
      throw new ProviderError(true);
    }
    if (response.ok) {
      try { return await response.json(); } catch { throw new ProviderError(); }
    }
    const detail = await response.text().catch(() => "");
    const delay = retryTiming.delaysMs[retry];
    const willRetry = TRANSIENT.has(response.status) && delay !== undefined;
    console.error(`[ai] ${name}: HTTP ${response.status}${willRetry ? `, retry ${retry + 1}` : ""} ${detail.replace(/\s+/g, " ").slice(0, 300)}`);
    if (!willRetry) throw new ProviderError(TRANSIENT.has(response.status));
    await sleep(delay);
  }
}

// OpenAI Responses API со строгими Structured Outputs.
const OpenAIResponse = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

function openaiProvider(apiKey: string, model: string): Provider {
  return {
    name: "openai",
    async call({ instructions, input, schemaName, schema, images }) {
      const content = images?.length
        ? [{ role: "user", content: [
            { type: "input_text", text: input },
            ...images.flatMap((img) => [
              { type: "input_text", text: img.label },
              { type: "input_image", image_url: `data:${img.mimeType};base64,${img.data}` },
            ]),
          ] }]
        : input;
      const json = await post("openai", "https://api.openai.com/v1/responses", { Authorization: `Bearer ${apiKey}` }, {
        model, store: false, max_output_tokens: 24000, instructions, input: content,
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
      });
      const result = OpenAIResponse.safeParse(json);
      if (!result.success || result.data.status !== "completed") {
        console.warn(`[ai] openai: response not completed (${result.success ? result.data.status : "unexpected shape"})`);
        return null;
      }
      const text = result.data.output.flatMap((o) => o.type === "message" ? o.content ?? [] : [])
        .filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
      return text || null;
    },
  };
}

// Gemini generateContent: JSON-ответ по схеме через responseJsonSchema.
const GeminiResponse = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
  })).optional(),
});

/**
 * Gemini понимает не весь JSON Schema: убираем служебный $schema и заменяем const на enum
 * из одного значения. Ещё убираем ограничения длины и чисел (minItems, maxLength, minimum…):
 * у объяснения со схемами много вложенных массивов, и с этими ограничениями Gemini отвечает
 * «schema produces a constraint that has too many states». Смысл схемы не меняется: все эти
 * ограничения всё равно проверяют Zod и validateLessonPlan(), а нарушения уходят модели в повтор.
 */
const GEMINI_DROPPED_KEYS = new Set(["$schema", "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern"]);

export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (GEMINI_DROPPED_KEYS.has(key)) continue;
    if (key === "const") out.enum = [value];
    else out[key] = toGeminiSchema(value);
  }
  return out;
}

/**
 * Запрос к Gemini с запасными моделями: если модель перегружена (503), упёрлась в лимит (429)
 * или не ответила вовремя, тот же запрос уходит следующей модели из GEMINI_MODEL.
 * Ошибку в самом запросе (400, 401) запасная модель не исправит, её отдаём сразу.
 */
async function postGemini(apiKey: string, models: string[], body: (model: string) => unknown): Promise<unknown> {
  for (let i = 0; ; i++) {
    const model = models[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
      return await post("gemini", url, { "x-goog-api-key": apiKey }, body(model));
    } catch (error) {
      const next = models[i + 1];
      if (!(error instanceof ProviderError) || !error.transient || !next) throw error;
      console.warn(`[ai] gemini: ${model} unavailable, switching to ${next}`);
    }
  }
}

function geminiProvider(apiKey: string, models: string[]): Provider {
  return {
    name: "gemini",
    async call({ instructions, input, schema, images }) {
      const parts = [
        { text: input },
        ...(images ?? []).flatMap((img) => [{ text: img.label }, { inlineData: { mimeType: img.mimeType, data: img.data } }]),
      ];
      const json = await postGemini(apiKey, models, (model) => ({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(schema),
          maxOutputTokens: 24000,
          // Модели Gemini 3 по умолчанию долго «размышляют»; для урока по готовой схеме хватает короткого
          // размышления. У моделей 2.5 этого параметра нет, и они по умолчанию не размышляют.
          ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }));
      const result = GeminiResponse.safeParse(json);
      const candidate = result.success ? result.data.candidates?.[0] : undefined;
      if (!candidate || candidate.finishReason !== "STOP") {
        const reason = !result.success ? "unexpected shape" : candidate?.finishReason ?? result.data.promptFeedback?.blockReason ?? "no candidates";
        console.warn(`[ai] gemini: answer not finished (${reason})`);
        return null;
      }
      const text = (candidate.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      return text || null;
    },
  };
}
