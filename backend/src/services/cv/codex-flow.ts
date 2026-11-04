import { assembleCv } from "../../domain/cv/cv.js";
import {
  actionableReviewSchema,
  coverageFailure,
  coverageMissing,
  coversRequirement,
  validateActionableFeedback,
  validateCoverage,
} from "../../domain/cv/review-coverage.js";
import type { Tailoring } from "../../domain/cv/tailoring.js";
import {
  draftSchemaFor,
  type Draft,
  type Profile,
  type Review,
} from "../../domain/types.js";
import type { GeminiInfer } from "../../infrastructure/providers/gemini-client.js";
import {
  codexReviewerPrompt,
  codexWriterPrompt,
  codexWriterSchema,
} from "../../prompts/codex-prompts.js";
import {
  geminiLocalIssues,
  type GeminiCheckpoint,
  type GeminiJob,
} from "./gemini-flow.js";

export const CODEX_PROMPT_VERSION = "2026-11-public-en-v1";

export async function runCodexCv(
  infer: GeminiInfer,
  profile: Profile,
  job: GeminiJob,
  options: {
    previous?: { draft: Draft; review: Review };
    pendingReview?: { draft: Draft; selection: Tailoring; round: number };
    onCheckpoint?: (value: GeminiCheckpoint) => void | Promise<void>;
  } = {},
) {
  const pending = options.pendingReview;

  if (
    pending &&
    (!Number.isInteger(pending.round) ||
      pending.round < 0 ||
      pending.round > 2 ||
      options.previous)
  )
    throw Error("Invalid review checkpoint.");
  let previous = options.previous,
    calls = 0,
    rounds = 0;
  let final!: { draft: Draft; review: Review; selection: Tailoring };
  let reviewOnly: { draft: Draft; selection: Tailoring } | undefined;
  let auditFeedback: string[] = [];
  const validIds = new Set(
    profile.experiences.flatMap((e) => e.facts.map((f) => f.id)),
  );

  for (let round = pending?.round ?? 0; round < 3; round++) {
    let draft: Draft, selection: Tailoring;

    if (reviewOnly) {
      ({ draft, selection } = reviewOnly);
      reviewOnly = undefined;
    } else if (pending && round === pending.round) {
      draft = draftSchemaFor(profile).parse(pending.draft);
      selection = structuredClone(pending.selection);
    } else {
      await options.onCheckpoint?.({ round, stage: "generating" });
      calls++;
      const output = await infer(
        "writer",
        codexWriterPrompt(profile, job, previous),
        codexWriterSchema(profile),
      );

      draft = output.draft;

      // Honor an unambiguous lead from the writer's plan without rewriting any claim.
      for (const experience of draft.experiences) {
        const lead = output.plan.choices.find(
          (choice) => choice.sourceId === experience.sourceId,
        )?.leadEvidenceIds;

        if (!lead?.length) continue;
        const matches = experience.bullets.filter(
          (bullet) =>
            bullet.evidenceIds.every((id) => lead.includes(id)) &&
            lead.every((id) => bullet.evidenceIds.includes(id)),
        );

        if (matches.length === 1 && matches[0] !== experience.bullets[0])
          experience.bullets = [
            matches[0],
            ...experience.bullets.filter((bullet) => bullet !== matches[0]),
          ];
      }

      selection = {
        assessmentStatus: "extracted",
        requirements: output.requirements
          .filter((r) => job.description.includes(r.requirement))
          .map((r) => ({
            ...r,
            evidenceIds: r.evidenceIds.filter((id) => validIds.has(id)),
          })),
        selectedSkills: draft.skills,
        priorities: draft.experiences.map((e) => ({
          sourceId: e.sourceId,
          evidenceIds: [...new Set(e.bullets.flatMap((b) => b.evidenceIds))],
          rationale: output.plan.choices.find(
            (choice) => choice.sourceId === e.sourceId,
          )?.firstBulletReason,
        })),
        editorialPlan: output.plan,
      } as Tailoring;
    }

    await options.onCheckpoint?.({
      round,
      stage: "reviewing",
      draft,
      selection,
    });

    const local = geminiLocalIssues(draft, profile, job);

    calls++;
    const review = await infer(
      "reviewer",
      codexReviewerPrompt(profile, job, draft, selection, local, auditFeedback),
      actionableReviewSchema,
    );
    const cv = assembleCv(
      draft,
      profile,
      job.language,
      job.title,
      job.description,
    );
    const text = [
      cv.headline,
      cv.summary,
      ...cv.experiences.flatMap((e) => [
        e.company,
        e.role,
        e.period,
        ...e.bullets,
        ...(e.technologies ?? []),
      ]),
      ...(cv.studies ?? []),
      ...cv.education,
      ...cv.languages,
    ].join("\n");
    const auditErrors = [
      ...validateCoverage(review.coverage, profile, job.description, text),
      ...validateActionableFeedback(review, draft, profile),
    ];

    for (const r of selection.requirements)
      if (
        !review.coverage.some((c) =>
          coversRequirement(c.requirementQuote, r.requirement),
        )
      )
        auditErrors.push(
          "Extracted requirement missing a coverage audit: " + r.requirement,
        );
    const modelIssues = review.issues.length;

    coverageFailure(review, auditErrors);
    review.missingRequirements = coverageMissing(review.coverage);
    // No keyword-based reconciliation: paraphrases and compound requirements must
    // retain the reviewer's evidence-linked semantic assessment.
    review.issues.push(
      ...local.map((problem) => ({
        severity: "blocking" as const,
        section: "Evidence",
        problem,
        fix: "Correct using current sources without changing correct passages.",
        category: "factual" as const,
        location: "local-validation",
        exactQuote: "",
        evidenceIds: [],
        minimalReplacement: "",
        preserve: [],
      })),
    );

    review.approved =
      review.approved && !review.issues.some((i) => i.severity === "blocking");

    if (
      !review.approved &&
      !review.issues.some((i) => i.severity === "blocking")
    )
      coverageFailure(review, [
        "Reviewer rejected without explaining a material issue.",
      ]);
    review.strengths = review.strengths.filter((q) => text.includes(q));
    final = { draft, review, selection };
    rounds = round + 1;
    await options.onCheckpoint?.({ round, stage: "reviewing", ...final });
    auditFeedback = auditErrors;

    if (auditErrors.length && !local.length && !modelIssues) {
      reviewOnly = { draft, selection };
      continue;
    }

    // Approval already means no material factual/editorial/coverage problem.
    // Keep optional advice visible without charging a new write + review cycle.
    if (review.approved) break;

    previous = { draft, review };
  }

  return {
    ...final,
    rounds,
    calls,
    cv: assembleCv(
      final.draft,
      profile,
      job.language,
      job.title,
      job.description,
    ),
    promptVersion: CODEX_PROMPT_VERSION,
  };
}
