export const providers = [
  "codex",
  "claude",
  "gemini",
  "ollama",
  "compatible",
] as const;

export type Provider = (typeof providers)[number];

export function parseProvider(value = "codex"): Provider {
  const provider = value.trim().toLowerCase();

  if (!providers.includes(provider as Provider)) {
    throw new Error(
      "Invalid CV_PROVIDER. Use codex, claude, gemini, ollama or compatible in .env.",
    );
  }

  return provider as Provider;
}

export function providerConfigurationIssues(settings: {
  cvProvider: Provider;
  geminiWriterKey: string;
  geminiReviewerKey: string;
  geminiModel: string;
  writerModel: string;
  reviewerModel: string;
  codexExecutable: string;
  claudeExecutable?: string;
  compatibleUrl?: string;
  compatibleModel?: string;
  compatibleWriterKey?: string;
  compatibleReviewerKey?: string;
}) {
  if (settings.cvProvider === "claude")
    return settings.claudeExecutable ? [] : ["Set CLAUDE_EXECUTABLE."];

  if (settings.cvProvider === "compatible") {
    // Local OpenAI-compatible servers may intentionally have no API key.
    return [
      !settings.compatibleUrl && "Set LLM_API_URL.",
      !settings.compatibleModel && "Set LLM_MODEL.",
    ].filter(Boolean) as string[];
  }

  if (settings.cvProvider === "gemini") {
    return [
      !settings.geminiWriterKey && "Set GEMINI_API_KEY_WRITER.",
      !settings.geminiReviewerKey && "Set GEMINI_API_KEY_REVIEWER.",
      !settings.geminiModel && "Set GEMINI_MODEL.",
    ].filter(Boolean) as string[];
  }

  if (settings.cvProvider === "ollama") {
    return [
      !settings.writerModel && "Set OLLAMA_MODEL_WRITER.",
      !settings.reviewerModel && "Set OLLAMA_MODEL_REVIEWER.",
    ].filter(Boolean) as string[];
  }

  return settings.codexExecutable ? [] : ["Set CODEX_EXECUTABLE."];
}
