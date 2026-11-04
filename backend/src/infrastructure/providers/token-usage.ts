import { AsyncLocalStorage } from "node:async_hooks";
import type { GeminiInfer, GeminiRole } from "./gemini-client.js";

export type TokenCall = {
  role: GeminiRole;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  measured: boolean;
  completed: boolean;
};

const context = new AsyncLocalStorage<TokenCall>();
const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

// Cached input is already part of inputTokens; reasoning is already part of outputTokens.
export function reportUsage(
  input: unknown,
  output: unknown,
  cached?: unknown,
  reasoning?: unknown,
) {
  const call = context.getStore();
  const inputTokens = count(input),
    outputTokens = count(output);

  if (!call || inputTokens === undefined || outputTokens === undefined) return;

  Object.assign(call, {
    inputTokens,
    outputTokens,
    cachedInputTokens: count(cached) ?? 0,
    reasoningTokens: count(reasoning) ?? 0,
    measured: true,
  });
}

export function reportCodexUsage(value: unknown) {
  const u = value as Record<string, unknown> | undefined;

  reportUsage(
    u?.input_tokens,
    u?.output_tokens,
    u?.cached_input_tokens,
    u?.reasoning_output_tokens,
  );
}

export function trackInference(
  infer: GeminiInfer,
  save: (call: TokenCall) => Promise<void>,
): GeminiInfer {
  return async (role, prompt, schema) => {
    // Fallback approximation of visible prompt only, never presented as measured billing usage.
    const call: TokenCall = {
      role,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      measured: false,
      completed: false,
    };

    return context.run(call, async () => {
      try {
        const output = await infer(role, prompt, schema);

        call.completed = true;

        if (!call.measured)
          call.outputTokens = Math.ceil(JSON.stringify(output).length / 4);

        return output;
      } finally {
        await save(call);
      }
    });
  };
}

export function summarizeUsage(calls: TokenCall[]) {
  const sum = (
    key:
      | "inputTokens"
      | "outputTokens"
      | "cachedInputTokens"
      | "reasoningTokens",
  ) => calls.reduce((n, c) => n + c[key], 0);

  return {
    calls,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("inputTokens") + sum("outputTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    reasoningTokens: sum("reasoningTokens"),
    measured: calls.length > 0 && calls.every((c) => c.measured),
  };
}
