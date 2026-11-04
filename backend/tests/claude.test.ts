import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { access } from "node:fs/promises";
import {
  claudeArgs,
  claudeCommand,
  claudeEnvironment,
  createClaudeClient,
  parseClaudeResult,
} from "../src/infrastructure/providers/claude-client.js";

const schema = z.object({ approved: z.boolean() });

describe("Claude CLI", () => {
  it("restricts tools and configuration without disabling permissions", () => {
    const args = claudeArgs("{}", "sonnet");

    expect(args).toContain("--safe-mode");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--json-schema");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--bare"); // bare mode would discard subscription login
  });

  it("does not inherit application credentials or execute npm entry points through a shell", () => {
    const e = claudeEnvironment({
      PATH: "bin",
      HOME: "home",
      GEMINI_API_KEY_WRITER: "private",
      DATABASE_URL: "private",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-auth",
    });

    expect(e).not.toHaveProperty("DATABASE_URL");
    expect(e).not.toHaveProperty("GEMINI_API_KEY_WRITER");
    expect(e.CLAUDE_CODE_OAUTH_TOKEN).toBe("claude-auth");
    expect(claudeCommand("test/cli.js").file).toBe(process.execPath);
  });

  it("sends the prompt through stdin, reads structured output and cleans up temporary files", async () => {
    let temporary = "";
    const execute = vi.fn(async (invocation) => {
      temporary = invocation.cwd;
      expect(invocation.input).toBe("Fatos e vaga");
      expect(
        JSON.parse(
          invocation.args[invocation.args.indexOf("--json-schema") + 1],
        ).properties.approved.type,
      ).toBe("boolean");

      return {
        code: 0,
        stdout: JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          structured_output: { approved: true },
        }),
        stderr: "",
      };
    });

    expect(
      await createClaudeClient({ execute })("writer", "Fatos e vaga", schema),
    ).toEqual({ approved: true });

    await expect(access(temporary)).rejects.toThrow();
  });

  it.each([
    { type: "result", subtype: "error_max_turns", is_error: true },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "texto sem schema",
    },
    {
      type: "result",
      subtype: "success",
      structured_output: { approved: true },
      permission_denials: [{ tool_name: "Bash" }],
    },
  ])("rejects errors, missing output and tool attempts", (result) =>
    expect(() => parseClaudeResult(JSON.stringify(result))).toThrow(),
  );

  it("does not retry process errors or expose stderr", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ code: 1, stdout: "", stderr: "credential-private" });
    const attempt = createClaudeClient({ execute })(
      "reviewer",
      "prompt",
      schema,
    );

    await expect(attempt).rejects.toThrow("code 1");
    await expect(attempt).rejects.not.toThrow("credential-private");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects schema violations even inside a success envelope", async () => {
    const execute = vi.fn().mockResolvedValue({
      code: 0,
      stderr: "",
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        structured_output: { approved: "sim" },
      }),
    });

    await expect(
      createClaudeClient({ execute })("reviewer", "prompt", schema),
    ).rejects.toThrow("outside the CV/review contract");
  });
});
