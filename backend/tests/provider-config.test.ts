import { describe, it, expect } from "vitest";
import {
  parseProvider,
  providerConfigurationIssues,
} from "../src/config/provider-config.js";

describe("provider configuration", () => {
  it.each(["codex", "claude", "gemini", "ollama", "compatible"] as const)(
    "selects %s explicitly",
    (provider) => expect(parseProvider(provider)).toBe(provider),
  );

  it("rejects provider typos rather than falling back to Ollama", () =>
    expect(() => parseProvider("gemni")).toThrow("CV_PROVIDER"));

  it("requires credentials only for the selected provider", () => {
    const settings = {
      cvProvider: "codex" as const,
      geminiWriterKey: "",
      geminiReviewerKey: "",
      geminiModel: "gemini-flash-latest",
      writerModel: "qwen3.5:9b",
      reviewerModel: "qwen3.5:9b",
      codexExecutable: "codex",
    };

    expect(providerConfigurationIssues(settings)).toEqual([]);
    expect(
      providerConfigurationIssues({ ...settings, cvProvider: "ollama" }),
    ).toEqual([]);

    expect(
      providerConfigurationIssues({ ...settings, cvProvider: "gemini" }),
    ).toHaveLength(2);

    expect(
      providerConfigurationIssues({
        ...settings,
        cvProvider: "gemini",
        geminiWriterKey: "test-writer",
        geminiReviewerKey: "test-reviewer",
      }),
    ).toEqual([]);
  });
});
