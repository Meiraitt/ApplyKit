import { z } from "zod";
import { validateEvidence } from "../../domain/cv/cv.js";
import {
  bulletWritingIssues,
  relationRule,
} from "../../domain/cv/evidence-policy.js";
import type { Draft, Profile } from "../../domain/types.js";
import type { generate } from "../../infrastructure/providers/llm.js";
import { authorshipRule } from "../../prompts/prompts.js";

export async function writePlannedExperience(
  infer: typeof generate,
  model: string,
  source: Profile["experiences"][number],
  profile: Profile,
  job: { language: string },
  context: string,
): Promise<Draft["experiences"][number]["bullets"]> {
  const ids = source.facts.map((f) => f.id) as [string, ...string[]];
  const schema = z
    .object({
      outline: z
        .array(
          z
            .object({
              purpose: z.string().min(10).max(240),
              evidenceIds: z.array(z.enum(ids)).min(1).max(3),
            })
            .strict(),
        )
        .min(1)
        .max(
          source.kind === "project" || /intern|estagi/i.test(source.role)
            ? 2
            : 4,
        ),
    })
    .strict();
  const plan = schema.parse(
    await infer(
      model,
      `PLAN_TOPICS: plan only the topics for this experience, not CV prose. Each topic has ONE central contribution and at most two related actions. Separate unrelated interfaces, endpoints, tests and collaboration. Use 2–4 topics for work and 1–2 for a project. Avoid repeated accessibility/tool inventories across employers. purpose explains the contribution without invented relationships or outcomes. Reserve confirmed code review, decisions or technical support when collaboration matters. Return only {outline:[{purpose,evidenceIds}]}.\n${context}`,
      schema,
    ),
  );
  const bullets: Draft["experiences"][number]["bullets"] = [];

  for (const topic of plan.outline) {
    const facts = source.facts
      .filter((f) => topic.evidenceIds.includes(f.id))
      .map((f) => ({ id: f.id, text: f.text, usage: f.usage }));

    if (!facts.some((f) => f.usage !== "context"))
      throw new Error(
        "Plan contains context only, no contribution: " + source.id,
      );
    const bulletSchema = z
      .object({
        text: z.string().min(15).max(600),
        evidenceIds: z
          .array(z.enum(topic.evidenceIds as [string, ...string[]]))
          .min(1)
          .max(3),
      })
      .strict();
    const prompt = `WRITE_TOPIC: write ONE CV bullet in ${job.language === "en" ? "English" : "Brazilian Portuguese"}, 20–40 words (up to 50 for a case). Portuguese uses first-person singular past tense without repeated pronouns; English uses natural action-led past tense. Use action, concrete contribution and useful context. Write original complete sentences, centered on the planned contribution; do not concatenate every fact. Omit secondary detail. The plan signals relevance, not evidence. Use only the facts below, including technologies. Do not add adjectives, benefits, guarantees or assumed purpose. Investigation retains supported problem, cause and correction. Do not hide concrete delivery behind vague participation.\n${authorshipRule}\n${relationRule}\nReturn {text,evidenceIds}.\n<CONTEXT>${JSON.stringify({ company: source.company, kind: source.kind, topic })}</CONTEXT><CONFIRMED_FACTS>${JSON.stringify(facts)}</CONFIRMED_FACTS>`;
    let bullet: z.infer<typeof bulletSchema> | undefined,
      failures: string[] = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      bullet = bulletSchema.parse(
        await infer(
          model,
          prompt +
            (attempt
              ? "\n<CORRIGIR>" +
                JSON.stringify(failures) +
                "</CORRIGIR><ANTERIOR>" +
                JSON.stringify(bullet) +
                "</ANTERIOR>"
              : ""),
          bulletSchema,
        ),
      );

      failures = [
        ...bulletWritingIssues(bullet.text),
        ...validateEvidence(
          {
            summary: "Summary not written yet.",
            skills: [],
            experiences: [{ sourceId: source.id, bullets: [bullet] }],
          },
          profile,
        ),
      ];

      if (!failures.length) break;
    }

    if (!bullet) throw new Error("No bullet produced.");
    bullets.push(bullet);
  }

  return bullets;
}

export { bulletWritingIssues } from "../../domain/cv/evidence-policy.js";
