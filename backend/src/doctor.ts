import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./config/config.js";
import { providerConfigurationIssues } from "./config/provider-config.js";
import { claudeCommand } from "./infrastructure/providers/claude-client.js";
import { createCompatibleClient } from "./infrastructure/providers/compatible-client.js";
import { loadProfile } from "./services/profile.service.js";

async function main() {
  const issues = providerConfigurationIssues(env);

  if (issues.length) throw new Error(issues.join(" "));
  const profile = await loadProfile();

  if (profile.notes.includes("PERFIL DE EXEMPLO"))
    throw new Error(
      "Replace the example profile in data/profile.json with your confirmed facts.",
    );
  console.log(`Valid profile. Selected provider: ${env.cvProvider}.`);

  if (env.cvProvider === "ollama") {
    const response = await fetch(`${env.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok)
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    const body = (await response.json()) as { models: Array<{ name: string }> };
    const available = new Set(body.models.map((m) => m.name));

    for (const model of [env.writerModel, env.reviewerModel]) {
      if (!available.has(model) && !available.has(`${model}:latest`))
        throw new Error(
          `Model missing from Ollama: ${model}. Download it with ollama pull.`,
        );
    }

    console.log("Ollama responded; models found.");
  } else if (env.cvProvider === "codex") {
    const { stdout } = await promisify(execFile)(
      env.codexExecutable,
      ["--version"],
      { windowsHide: true, timeout: 10000 },
    );

    console.log(stdout.trim());
    console.log(
      "Executable found. Login and model access will be checked during generation; this diagnostic does not generate content.",
    );
  } else if (env.cvProvider === "claude") {
    const command = claudeCommand(env.claudeExecutable);
    const { stdout } = await promisify(execFile)(
      command.file,
      [...command.prefix, "--version"],
      { windowsHide: true, timeout: 10000 },
    );

    console.log(stdout.trim());

    if (/^1\./.test(stdout.trim()))
      throw new Error(
        "Claude Code 1.x is incompatible. Update to a CLI version supporting --safe-mode, --tools and --json-schema.",
      );
    console.log(
      "Executable found. Integration requires --safe-mode, --tools and --json-schema. Login, access and full compatibility are checked during generation. No content sent.",
    );
  } else if (env.cvProvider === "compatible") {
    createCompatibleClient({
      url: env.compatibleUrl,
      model: env.compatibleModel,
      writerKey: env.compatibleWriterKey,
      reviewerKey: env.compatibleReviewerKey,
      responseFormat: env.compatibleResponseFormat,
    });

    console.log(
      `Compatible API configured for ${new URL(env.compatibleUrl).host}; model ${env.compatibleModel}. No request sent. Authentication and response-format support not yet tested.`,
    );
  } else {
    console.log(
      `Gemini: model ${env.geminiModel}; both keys set. No request sent; access and quotas not tested.`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
