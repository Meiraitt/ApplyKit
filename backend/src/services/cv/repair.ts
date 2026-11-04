import { z } from "zod";
import {
  draftSchemaFor,
  type Draft,
  type Profile,
  type Review,
} from "../../domain/types.js";
import type { generate } from "../../infrastructure/providers/llm.js";
import { repairPrompt, summaryRepairPrompt } from "../../prompts/prompts.js";

export async function repairGroundedDraft(
  infer: typeof generate,
  model: string,
  profile: Profile,
  job: unknown,
  feedback: Review,
  previous: Draft,
): Promise<Draft> {
  const choices = (values: string[]) => z.enum(values as [string, ...string[]]);
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  // All textual corrections are authored by the model and remain scoped to the review.
  let summaryAllowed = false,
    skillsAllowed = false;
  const editable = new Map<string, Set<number>>(),
    reorderable = new Set<string>();

  for (const issue of feedback.issues) {
    const section = normalize(issue.section),
      problem = normalize(issue.problem),
      all = normalize(`${issue.problem} ${issue.fix}`);

    if (/resumo|summary/.test(section + " " + problem)) {
      summaryAllowed = true;
      continue;
    }

    if (/habilidad|skills/.test(section + " " + problem)) {
      skillsAllowed = true;
      continue;
    }

    for (const item of previous.experiences) {
      const source = profile.experiences.find((e) => e.id === item.sourceId)!;
      const company = normalize(source.company),
        sourceId = normalize(source.id);

      if (
        ![section, problem].some(
          (text) =>
            text.includes(company) ||
            text.includes(sourceId) ||
            (section.length >= 3 && company.includes(section)),
        )
      )
        continue;

      if (/reorden|ordem|primeiro|order/.test(all)) {
        reorderable.add(item.sourceId);

        if (/preserv.{0,30}text|keep.{0,30}text/.test(all)) continue;
      }

      const indices = item.bullets.flatMap((bullet, index) =>
        bullet.evidenceIds.some((id) =>
          new RegExp(`\\b${id}\\b`, "i").test(all),
        )
          ? [index]
          : [],
      );
      const allowed = editable.get(item.sourceId) ?? new Set<number>();

      for (const index of indices.length
        ? indices
        : item.bullets.map((_, index) => index))
        allowed.add(index);

      if (
        /adicion|inclu|omitid|append|missing/.test(all) &&
        item.bullets.length < (/intern|estagi/i.test(source.role) ? 2 : 4)
      )
        allowed.add(item.bullets.length);
      editable.set(item.sourceId, allowed);
    }
  }

  // An ambiguous report must never authorize rewriting the entire document.
  if (!summaryAllowed && !skillsAllowed && !editable.size && !reorderable.size)
    return structuredClone(previous);
  const variants = previous.experiences
    .filter((item) => editable.has(item.sourceId))
    .map((item) => {
      const source = profile.experiences.find((e) => e.id === item.sourceId);

      if (!source)
        throw new Error(
          "Draft experience does not exist in the saved profile.",
        );

      return z
        .object({
          sourceId: z.literal(source.id),
          bulletIndex: z
            .number()
            .int()
            .min(0)
            .max(item.bullets.length)
            .refine(
              (index) => editable.get(item.sourceId)!.has(index),
              "Bullet edit not authorized by feedback.",
            ),
          text: z.string().min(15).max(650),
          evidenceIds: z.array(choices(source.facts.map((f) => f.id))).min(1),
        })
        .strict();
    });
  const emptyEdit = z.object({
    sourceId: z.string(),
    bulletIndex: z.number(),
    text: z.string(),
    evidenceIds: z.array(z.string()),
  });
  const edit =
    variants.length === 0
      ? emptyEdit
      : variants.length === 1
        ? variants[0]
        : z.discriminatedUnion(
            "sourceId",
            variants as [
              (typeof variants)[number],
              (typeof variants)[number],
              ...(typeof variants)[number][],
            ],
          );
  const schema = z
    .object({
      summary: summaryAllowed
        ? z
            .object({
              text: z.string().min(30).max(1000),
              evidenceIds: z
                .array(
                  choices(
                    profile.experiences.flatMap((e) =>
                      e.facts.map((f) => f.id),
                    ),
                  ),
                )
                .min(1),
            })
            .nullable()
        : z.null(),
      skills: skillsAllowed
        ? z.array(choices(profile.skills)).max(10).nullable()
        : z.null(),
      edits: z.array(edit).max(variants.length ? 12 : 0),
      orders: z
        .array(
          z
            .object({
              sourceId: reorderable.size
                ? choices([...reorderable])
                : z.string(),
              bulletOrder: z.array(z.number().int().min(0)).max(5),
            })
            .strict(),
        )
        .max(reorderable.size)
        .default([]),
    })
    .strict();
  const scope = {
    summary: summaryAllowed,
    skills: skillsAllowed,
    edits: [...editable].map(([sourceId, indices]) => ({
      sourceId,
      bulletIndices: [...indices],
    })),
    orders: [...reorderable],
  };
  const prompt =
    summaryAllowed && !skillsAllowed && !editable.size && !reorderable.size
      ? summaryRepairPrompt(profile, job, previous, feedback)
      : repairPrompt(profile, job, previous, feedback);
  const patch = schema.parse(
    await infer(
      model,
      `${prompt}\n<ALLOWED_SCOPE>${JSON.stringify(scope)}</ALLOWED_SCOPE>\nChange only allowed fields. Outside that scope, return null or [].`,
      schema,
    ),
  );
  const result = structuredClone(previous),
    seen = new Set<string>();

  if (patch.summary) {
    result.summary = patch.summary.text;
    result.summaryEvidenceIds = patch.summary.evidenceIds;
  }

  if (patch.skills) result.skills = patch.skills;

  for (const edit of patch.edits) {
    const key = `${edit.sourceId}:${edit.bulletIndex}`;

    if (seen.has(key))
      throw new Error("The correction tried to edit the same bullet twice.");
    seen.add(key);
    const item = result.experiences.find((e) => e.sourceId === edit.sourceId)!;

    item.bullets[edit.bulletIndex] = {
      text: edit.text,
      evidenceIds: edit.evidenceIds,
    };
  }

  const ordered = new Set<string>();

  for (const order of patch.orders) {
    const item = result.experiences.find((e) => e.sourceId === order.sourceId)!;

    if (
      ordered.has(order.sourceId) ||
      order.bulletOrder.length !== item.bullets.length ||
      new Set(order.bulletOrder).size !== item.bullets.length ||
      order.bulletOrder.some((index) => index >= item.bullets.length)
    )
      throw new Error("The correction returned an invalid bullet order.");
    ordered.add(order.sourceId);
    item.bullets = order.bulletOrder.map((index) => item.bullets[index]);
  }

  // Unmentioned fields retain their exact original text and references.
  return draftSchemaFor(profile).parse(result);
}
