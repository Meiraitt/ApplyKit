import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResponseFormat } from "../infrastructure/providers/compatible-client.js";
import { parseProvider } from "./provider-config.js";

export const root = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
config({ path: resolve(root, ".env") });

export const env = {
  claudeExecutable: process.env.CLAUDE_EXECUTABLE ?? "claude",
  claudeModel: process.env.CLAUDE_MODEL || undefined,
  compatibleUrl: process.env.LLM_API_URL ?? "",
  compatibleModel: process.env.LLM_MODEL ?? "",
  compatibleWriterKey:
    process.env.LLM_API_KEY_WRITER || process.env.LLM_API_KEY || "",
  compatibleReviewerKey:
    process.env.LLM_API_KEY_REVIEWER || process.env.LLM_API_KEY || "",
  compatibleResponseFormat: (process.env.LLM_RESPONSE_FORMAT ||
    "json_object") as ResponseFormat,
  cvProvider: parseProvider(process.env.CV_PROVIDER),
  cvConcurrency: Math.min(
    3,
    Math.max(1, Math.trunc(Number(process.env.CV_CONCURRENCY) || 1)),
  ),
  codexExecutable: process.env.CODEX_EXECUTABLE ?? "codex",
  codexModel: process.env.CODEX_MODEL || undefined,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  geminiWriterKey: process.env.GEMINI_API_KEY_WRITER ?? "",
  geminiReviewerKey: process.env.GEMINI_API_KEY_REVIEWER ?? "",
  databaseUrl:
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_HOST
      ? `postgresql://applykit:${encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "")}@${process.env.POSTGRES_HOST}:5432/applykit`
      : "postgresql://applykit@127.0.0.1:54329/applykit"),
  host: process.env.BACKEND_HOST || "127.0.0.1",
  port: Number(process.env.BACKEND_PORT ?? 3333),
  ollamaHost: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
  writerModel: process.env.OLLAMA_MODEL_WRITER ?? "qwen2.5:7b-instruct",
  reviewerModel: process.env.OLLAMA_MODEL_REVIEWER ?? "qwen2.5:7b-instruct",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChat: process.env.TELEGRAM_CHAT_ID,
  profilePath: resolve(root, "data/profile.json"),
  artifactDir: resolve(root, "data/cvs"),
};
