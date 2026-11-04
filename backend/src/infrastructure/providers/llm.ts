import { z } from "zod";
import { toJSONSchema } from "zod";
import { env } from "../../config/config.js";
import { buildRequest, requestOllama } from "./ollama-client.js";
import { reportUsage } from "./token-usage.js";

export async function generate<T extends z.ZodTypeAny>(
  model: string,
  prompt: string,
  schema: T,
): Promise<z.infer<T>> {
  const body = await requestOllama(
    env.ollamaHost,
    buildRequest(
      model,
      prompt,
      toJSONSchema(schema, { target: "draft-7", io: "output" }),
    ),
  );

  reportUsage(body.prompt_eval_count, body.eval_count);

  try {
    return schema.parse(JSON.parse(body.message.content));
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : "Incomplete or invalid JSON";

    throw new Error(
      "The model returned an invalid structure. " +
        detail +
        ". Try generating again.",
    );
  }
}
