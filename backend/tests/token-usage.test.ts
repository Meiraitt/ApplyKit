import { expect, it } from "vitest";
import { z } from "zod";
import {
  reportUsage,
  reportCodexUsage,
  trackInference,
  summarizeUsage,
  type TokenCall,
} from "../src/infrastructure/providers/token-usage.js";

it("isolates concurrent token usage and avoids double-counting cache", async () => {
  const saved: TokenCall[] = [];
  const infer = trackInference(
    async (role, _prompt, schema) => {
      await new Promise((resolve) =>
        setTimeout(resolve, role === "writer" ? 10 : 1),
      );

      reportCodexUsage({
        input_tokens: role === "writer" ? 100 : 200,
        output_tokens: 20,
        cached_input_tokens: 50,
      });

      return schema.parse({ ok: true });
    },
    async (call) => {
      saved.push(call);
    },
  );

  await Promise.all([
    infer("writer", "texto", z.object({ ok: z.boolean() })),
    infer("reviewer", "texto", z.object({ ok: z.boolean() })),
  ]);

  expect(saved.find((c) => c.role === "writer")?.inputTokens).toBe(100);
  expect(summarizeUsage(saved)).toMatchObject({
    totalTokens: 340,
    cachedInputTokens: 100,
    measured: true,
  });
});

it("retains usage for rejected output and labels estimates", async () => {
  const calls: TokenCall[] = [];
  const fail = trackInference(
    async () => {
      reportUsage(40, 10);

      throw Error("JSON inválido");
    },
    async (c) => {
      calls.push(c);
    },
  );

  await expect(fail("reviewer", "abc", z.object({}))).rejects.toThrow(
    "JSON inválido",
  );

  expect(calls[0]).toMatchObject({
    completed: false,
    measured: true,
    inputTokens: 40,
  });

  const fallback = trackInference(
    async (_r, _p, s) => s.parse({}),
    async (c) => {
      calls.push(c);
    },
  );

  await fallback("writer", "12345678", z.object({}));
  expect(calls[1]).toMatchObject({
    inputTokens: 2,
    outputTokens: 1,
    measured: false,
  });

  expect(summarizeUsage(calls).measured).toBe(false);
});
