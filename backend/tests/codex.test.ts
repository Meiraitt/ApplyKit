import { describe, it, expect, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  createCodexClient,
  codexEnvironment,
  inspectCodexEvents,
} from "../src/infrastructure/providers/codex-client.js";

const complete = JSON.stringify({
  type: "turn.completed",
  usage: { input_tokens: 10, output_tokens: 5 },
});

describe("Codex CLI boundary", () => {
  it("does not mask provider failures or discard validated results on cleanup errors", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup: typeof rm = async (target, options) => {
      expect(options?.maxRetries).toBe(5);
      // The client has already validated this owned temporary path.
      await rm(target, options);

      throw new Error("simulated EBUSY");
    };

    try {
      const failed = createCodexClient({
        cleanup,
        execute: async () => {
          throw new Error("original timeout");
        },
      });

      await expect(failed("reviewer", "x", z.object({}))).rejects.toThrow(
        "original timeout",
      );

      const success = createCodexClient({
        cleanup,
        execute: async (request) => {
          await writeFile(
            request.args[request.args.indexOf("--output-last-message") + 1],
            JSON.stringify({ ok: true }),
          );

          return { code: 0, stdout: complete, stderr: "" };
        },
      });

      await expect(
        success("writer", "x", z.object({ ok: z.boolean() })),
      ).resolves.toEqual({ ok: true });

      expect(warning).toHaveBeenCalledTimes(2);
    } finally {
      warning.mockRestore();
    }
  });

  it("sends private prompt via stdin, uses fresh read-only sessions and validates structured results", async () => {
    const requests: any[] = [];
    const execute: any = async (r: any) => {
      requests.push(r);
      await writeFile(
        r.args[r.args.indexOf("--output-last-message") + 1],
        JSON.stringify({ ok: true }),
      );

      return { code: 0, stdout: complete, stderr: "" };
    };
    const infer = createCodexClient({ execute });

    await infer("writer", "private facts", z.object({ ok: z.boolean() }));
    await infer("reviewer", "review facts", z.object({ ok: z.boolean() }));
    expect(requests[0].cwd).not.toEqual(requests[1].cwd);
    expect(requests[0].input).toContain("private facts");
    expect(requests[0].args).not.toContain("private facts");
    expect(requests[0].args).toContain("--ephemeral");
    expect(requests[0].args).toContain("read-only");
  });

  it("never forwards application secrets to the CLI process", () => {
    expect(
      codexEnvironment({
        PATH: "bin",
        USERPROFILE: "user",
        CODEX_HOME: "codex",
        GEMINI_API_KEY_WRITER: "secret",
        TELEGRAM_BOT_TOKEN: "secret",
        DATABASE_URL: "secret",
        OPENAI_API_KEY: "secret",
      }),
    ).toEqual({ PATH: "bin", USERPROFILE: "user", CODEX_HOME: "codex" });
  });

  it("stops without retry on execution error", async () => {
    const execute: any = vi.fn(async () => ({
      code: 1,
      stdout: "",
      stderr: "quota exceeded",
    }));

    await expect(
      createCodexClient({ execute })("reviewer", "review", z.object({})),
    ).rejects.toThrow("quota exceeded");

    expect(execute).toHaveBeenCalledOnce();
  });

  it("refuses incomplete, failed or tool-using sessions", () => {
    expect(() => inspectCodexEvents("{}")).toThrow("completion");
    expect(() =>
      inspectCodexEvents(
        JSON.stringify({ type: "turn.failed", error: "quota" }),
      ),
    ).toThrow("quota");

    expect(() =>
      inspectCodexEvents(
        complete +
          "\n" +
          JSON.stringify({
            type: "item.completed",
            item: { type: "command_execution" },
          }),
      ),
    ).toThrow("tools");
  });

  it("does not accept malformed JSON as a CV and enforces the call ceiling", async () => {
    const execute: any = vi.fn(async (r: any) => {
      await writeFile(
        r.args[r.args.indexOf("--output-last-message") + 1],
        '{"ok":"wrong"}',
      );

      return { code: 0, stdout: complete, stderr: "" };
    });
    const infer = createCodexClient({ execute, maxCalls: 1 });

    await expect(
      infer("writer", "x", z.object({ ok: z.boolean() })),
    ).rejects.toThrow("contract");

    await expect(
      infer("writer", "x", z.object({ ok: z.boolean() })),
    ).rejects.toThrow("execution limit");

    expect(execute).toHaveBeenCalledOnce();
  });
});
