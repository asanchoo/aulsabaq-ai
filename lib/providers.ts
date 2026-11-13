import { z } from "zod";

/**
 * Провайдеры модели: только HTTP-запрос и извлечение текста ответа.
 * Что такое урок и как его проверять, здесь не знают: это делает lib/ai.ts.
 * Ключи и модели читаются из env на сервере и никогда не попадают в клиент.
 */

export type ProviderName = "openai" | "gemini";

export type ProviderRequest = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
};

/** Текст ответа или null, если модель не закончила (отказ, обрыв по длине, блокировка). */
export type Provider = { name: ProviderName; call(req: ProviderRequest): Promise<string | null> };

export class ProviderError extends Error {
  constructor() { super("provider"); }
}

// Урок — длинный JSON; две попытки по 100 секунд укладываются в maxDuration роута (300).
const TIMEOUT_MS = 100_000;

/**
 * Какого провайдера использовать. AI_PROVIDER задаёт его явно; если не задан,
 * берём того, чей ключ и модель заполнены (сначала OpenAI, потом Gemini).
 * Нет ни одного: null, и API честно отвечает «не подключено».
 */
export function resolveProvider(env: Record<string, string | undefined> = process.env): Provider | null {
  const openai = env.OPENAI_API_KEY && env.OPENAI_MODEL ? openaiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL) : null;
  const gemini = env.GEMINI_API_KEY && env.GEMINI_MODEL ? geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null;
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
export const retryTiming = { delaysMs: [1500, 4000] };
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
      console.error(`[ai] ${name}: request failed (${error instanceof Error ? error.name : "unknown"})`);
      throw new ProviderError();
    }
    if (response.ok) {
      try { return await response.json(); } catch { throw new ProviderError(); }
    }
    const detail = await response.text().catch(() => "");
    const delay = retryTiming.delaysMs[retry];
    const willRetry = TRANSIENT.has(response.status) && delay !== undefined;
    console.error(`[ai] ${name}: HTTP ${response.status}${willRetry ? `, retry ${retry + 1}` : ""} ${detail.replace(/\s+/g, " ").slice(0, 300)}`);
    if (!willRetry) throw new ProviderError();
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
    async call({ instructions, input, schemaName, schema }) {
      const json = await post("openai", "https://api.openai.com/v1/responses", { Authorization: `Bearer ${apiKey}` }, {
        model, store: false, max_output_tokens: 10000, instructions, input,
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
 * из одного значения. Смысл схемы не меняется, а всё, что Gemini не проверит сам
 * (например, minLength), всё равно проверяют Zod и validateLessonPlan().
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema") continue;
    if (key === "const") out.enum = [value];
    else out[key] = toGeminiSchema(value);
  }
  return out;
}

function geminiProvider(apiKey: string, model: string): Provider {
  return {
    name: "gemini",
    async call({ instructions, input, schema }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const json = await post("gemini", url, { "x-goog-api-key": apiKey }, {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        // Модели Gemini 3 по умолчанию долго «размышляют»; для урока по готовой схеме хватает короткого
        // размышления. Лимит токенов включает и его, поэтому запас больше, чем у OpenAI.
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(schema),
          maxOutputTokens: 16000,
          thinkingConfig: { thinkingLevel: "low" },
        },
      });
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
