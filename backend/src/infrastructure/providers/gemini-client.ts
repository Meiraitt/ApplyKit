import { z } from "zod";
import { toJSONSchema } from "zod";
import { systemPrompt } from "../../prompts/prompts.js";
import { reportUsage } from "./token-usage.js";

export type GeminiRole = "writer" | "reviewer";

export type GeminiInfer = <T extends z.ZodTypeAny>(
  role: GeminiRole,
  prompt: string,
  schema: T,
) => Promise<z.infer<T>>;

export class GeminiError extends Error {
  readonly noAutomaticRetry = true;
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export type GeminiMetric = {
  call: number;
  role: GeminiRole;
  model: string;
  modelVersion?: string;
  status: number;
  seconds: number;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
};

// Keep the wire schema small; the full Zod schema still validates the returned value.
export function geminiWireSchema(value: any): any {
  if (Array.isArray(value)) return value.map(geminiWireSchema);

  if (!value || typeof value !== "object") return value;
  const out: any = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      [
        "$schema",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "const",
      ].includes(key)
    )
      continue;

    if (key === "enum" && Array.isArray(item) && item.length > 10) continue;
    out[key] = geminiWireSchema(item);
  }

  if (out.anyOf) {
    const unique = [
      ...new Map(out.anyOf.map((v: any) => [JSON.stringify(v), v])).values(),
    ];

    if (unique.length === 1) return unique[0];
    out.anyOf = unique;
  }

  return out;
}

export function parseGeminiResponse(body: any) {
  const candidate = body?.candidates?.[0];

  if (candidate?.finishReason !== "STOP")
    throw new GeminiError(
      "Gemini did not complete the response. No approval issued.",
    );
  const text = (candidate.content?.parts ?? [])
    .filter((p: any) => typeof p.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("");

  if (!text)
    throw new GeminiError("Gemini returned a response without JSON text.");

  return text;
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);

  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || undefined;
}

export function createGeminiClient(options: {
  model: string;
  writerKey: string;
  reviewerKey: string;
  maxCalls?: number;
  minIntervalMs?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  fetcher?: typeof fetch;
  onMetric?: (m: GeminiMetric) => void | Promise<void>;
  onDiagnostic?: (d: Record<string, unknown>) => void | Promise<void>;
}) {
  let count = 0;
  const last = new Map<string, number>();
  const redact = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (_key, item) =>
        typeof item === "string"
          ? [options.writerKey, options.reviewerKey]
              .filter(Boolean)
              .reduce((text, key) => text.split(key).join("[REDACTED]"), item)
              .replace(/AIza[\w-]+/g, "[REDACTED]")
          : item,
      ),
    );
  const diagnostic = async (value: Record<string, unknown>) => {
    await options.onDiagnostic?.(redact(value));
  };
  const inferOnce = async <T extends z.ZodTypeAny>(
    role: GeminiRole,
    prompt: string,
    schema: T,
    isRetry = false,
  ) => {
    const key = (
      role === "writer" ? options.writerKey : options.reviewerKey
    ).trim();

    if (!key)
      throw new GeminiError(
        `Set GEMINI_API_KEY_${role === "writer" ? "WRITER" : "REVIEWER"} in .env.`,
      );

    if (count >= (options.maxCalls ?? 6))
      throw new GeminiError("CV execution limit reached.");
    const wait =
      (options.minIntervalMs ?? 13000) - (Date.now() - (last.get(key) ?? 0));

    if (wait > 0 && !isRetry)
      await (
        options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
      )(wait);
    const call = ++count,
      start = Date.now();

    last.set(key, start);
    const jsonSchema = geminiWireSchema(
      toJSONSchema(schema, { target: "draft-7", io: "output" }),
    );
    const request = {
      store: false,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        maxOutputTokens: 12288,
        thinkingConfig: { thinkingLevel: "MEDIUM" },
      },
    };

    await diagnostic({
      phase: "request",
      call,
      role,
      model: options.model,
      body: request,
    });

    let response: Response;

    try {
      response = await (options.fetcher ?? fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify(request),
        },
      );
    } catch (error) {
      await diagnostic({
        phase: "network-error",
        call,
        role,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                cause: (error.cause as any)?.code,
              }
            : String(error),
      });

      await options.onMetric?.({
        call,
        role,
        model: options.model,
        status: 0,
        seconds: (Date.now() - start) / 1000,
      });

      throw new GeminiError(
        "Gemini network failure or timeout. No automatic retry to preserve quota.",
      );
    }

    let responseText: string;

    try {
      responseText = await response.text();
    } catch (error) {
      await diagnostic({
        phase: "body-error",
        call,
        role,
        status: response.status,
        error: error instanceof Error ? error.message : String(error),
      });

      await options.onMetric?.({
        call,
        role,
        model: options.model,
        status: response.status,
        seconds: (Date.now() - start) / 1000,
      });

      throw new GeminiError(
        "Connection ended before the complete response body arrived. No automatic retry.",
      );
    }

    let body: any;

    try {
      body = JSON.parse(responseText);
    } catch {
      body = null;
    }

    await diagnostic({
      phase: "response",
      call,
      role,
      status: response.status,
      contentType: response.headers.get("content-type"),
      retryAfter: response.headers.get("retry-after"),
      requestId:
        response.headers.get("x-request-id") ??
        response.headers.get("x-goog-request-id"),
      body: body ?? responseText,
    });

    const metric = {
      call,
      role,
      model: options.model,
      modelVersion: body?.modelVersion,
      status: response.status,
      seconds: (Date.now() - start) / 1000,
      inputTokens: body?.usageMetadata?.promptTokenCount,
      outputTokens: body?.usageMetadata?.candidatesTokenCount,
      thoughtTokens: body?.usageMetadata?.thoughtsTokenCount,
    };

    reportUsage(
      metric.inputTokens,
      metric.outputTokens === undefined
        ? undefined
        : metric.outputTokens + (metric.thoughtTokens ?? 0),
      body?.usageMetadata?.cachedContentTokenCount,
      metric.thoughtTokens,
    );

    await options.onMetric?.(metric);

    // Only a bounded, credential-redacted provider message may appear in diagnostics.
    if (!response.ok) {
      const code = String(body?.error?.status ?? "")
        .replace(/[^A-Z_]/g, "")
        .slice(0, 60);
      const detail = String(body?.error?.message ?? "")
        .split(options.writerKey || "__unused__")
        .join("[REDACTED]")
        .split(options.reviewerKey || "__unused__")
        .join("[REDACTED]")
        .replace(/AIza[\w-]+/g, "[REDACTED]")
        .slice(0, 700);

      throw new GeminiError(
        response.status === 429
          ? "Gemini quota reached (HTTP 429). Processing stopped without automatic retry."
          : response.status >= 500
            ? `Gemini service unavailable (HTTP ${response.status}). Processing stopped without automatic retry. ${code}: ${detail}`
            : `Gemini returned HTTP ${response.status}. Check model, key and access in AI Studio. No approval issued. ${code}: ${detail}`,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    try {
      return schema.parse(JSON.parse(parseGeminiResponse(body)));
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      await diagnostic({
        phase: "validation-error",
        call,
        role,
        issues:
          error instanceof z.ZodError
            ? error.issues
            : error instanceof Error
              ? error.message
              : String(error),
      });

      throw new GeminiError(
        "Gemini returned JSON outside the expected format. Processing stopped without automatic retry.",
      );
    }
  };
  const infer: GeminiInfer = async (role, prompt, schema) => {
    const delays = options.retryDelaysMs ?? [];

    for (let attempt = 0; ; attempt++) {
      try {
        return await inferOnce(role, prompt, schema, attempt > 0);
      } catch (error) {
        // Retry only explicit transient server responses, never quota/auth/schema errors or ambiguous network failures.
        const delay = delays[attempt];

        if (
          !(error instanceof GeminiError) ||
          ![500, 502, 503, 504].includes(error.httpStatus ?? 0) ||
          delay === undefined ||
          count >= (options.maxCalls ?? 6) ||
          (error.retryAfterMs ?? 0) > delay
        )
          throw error;
        await diagnostic({
          phase: "backoff",
          call: count,
          role,
          attempt: attempt + 1,
          delayMs: delay,
          status: error.httpStatus,
        });

        await (
          options.sleep ??
          ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
        )(delay);
      }
    }
  };

  return infer;
}
