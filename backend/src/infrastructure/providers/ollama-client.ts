import { systemPrompt } from "../../prompts/prompts.js";

export function inferenceOptions(model: string, prompt: string) {
  const qwen35 = /qwen3\.5/i.test(model);
  const review =
    /CV_TEXT|Evaluate EVERY bullet|PLAN_IS_NOT_EVIDENCE|VERIFY_REPLACEMENT/.test(
      prompt,
    );
  const selection = /REQUIRED_HISTORY|PLAN_TOPICS/.test(prompt);

  return qwen35
    ? {
        temperature: review ? 0.1 : selection ? 0.2 : 0.35,
        top_p: 0.8,
        top_k: 20,
        min_p: 0,
        presence_penalty: 0.2,
        repeat_penalty: 1,
        num_ctx: 16384,
        num_predict: 6000,
      }
    : { temperature: 0.15, num_ctx: 16384, num_predict: 4000 };
}

export function buildRequest(model: string, prompt: string, format: unknown) {
  return {
    model,
    stream: true,
    keep_alive: "15m",
    ...(/qwen3\.5/i.test(model) ? { think: false } : {}),
    format,
    options: inferenceOptions(model, prompt),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  };
}

export async function readOllamaStream(response: Response) {
  if (!response.ok)
    throw new Error(
      `Ollama returned HTTP ${response.status}. Check that the model is installed.`,
    );

  if (!response.body) throw new Error("Ollama returned an empty response.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    content = "",
    terminal: any;
  const accept = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);

    if (chunk.error) throw new Error("Ollama: " + chunk.error);
    content += chunk.message?.content ?? "";

    if (chunk.done) terminal = chunk;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline;

      while ((newline = pending.indexOf("\n")) >= 0) {
        accept(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }

    pending += decoder.decode();
    accept(pending);
  } finally {
    reader.releaseLock();
  }

  if (!terminal)
    throw new Error(
      "Ollama stopped before completing the response. No approval issued.",
    );

  if (terminal.done_reason === "length")
    throw new Error(
      "The model reached its output limit before completion. No approval issued.",
    );

  return { ...terminal, message: { role: "assistant", content } };
}

export async function requestOllama(
  host: string,
  request: ReturnType<typeof buildRequest>,
) {
  return readOllamaStream(
    await fetch(`${host.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12 * 60 * 1000),
      body: JSON.stringify(request),
    }),
  );
}
