import { z } from "zod";
import {
  reviewSchema,
  type Draft,
  type Profile,
  type Review,
} from "../types.js";

export const coverageSchema = z.object({
  requirementQuote: z.string().min(1),
  profileStatus: z.enum([
    "professional",
    "personal",
    "study",
    "partial",
    "unknown",
  ]),
  evidenceIds: z.array(z.string()),
  cvStatus: z.enum(["demonstrated", "listed", "absent"]),
  cvQuotes: z.array(z.string()),
  missingParts: z.array(z.string()),
  explanation: z.string().min(1),
});

export const actionableReviewSchema = reviewSchema
  .omit({ artifactValidation: true, bulletAudit: true })
  .extend({
    coverage: z.array(coverageSchema),
    issues: z.array(
      z.object({
        severity: z.enum(["blocking", "suggestion"]),
        section: z.string(),
        problem: z.string(),
        fix: z.string(),
        category: z.enum(["factual", "editorial", "coverage"]),
        location: z.string(),
        exactQuote: z.string(),
        evidenceIds: z.array(z.string()),
        minimalReplacement: z.string(),
        preserve: z.array(z.string()),
      }),
    ),
  });

export type Coverage = z.infer<typeof coverageSchema>;

export function coversRequirement(quote: string, requirement: string) {
  if (!requirement.trim()) return false;
  let from = 0;

  for (;;) {
    const at = quote.indexOf(requirement, from);

    if (at < 0) return false;
    const before = quote[at - 1] ?? "",
      after = quote[at + requirement.length] ?? "";

    if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after))
      return true;
    from = at + 1;
  }
}

export function globalReviewEvidence(profile: Profile) {
  return [
    { id: "profile:notes", scope: "mixed", sourceText: profile.notes },
    ...(profile.studies ?? []).map((text, index) => ({
      id: "profile:studies:" + index,
      scope: "study",
      sourceText: text,
    })),
  ];
}

// Validate provenance, never infer semantic support from token matching. The model's
// interpretation remains inspectable; no coverage status is an ATS score or hiring verdict.
export function validateCoverage(
  rows: Coverage[],
  profile: Profile,
  description: string,
  cvText: string,
) {
  const facts = new Map<string, { kind: string }>(
    profile.experiences.flatMap((e) =>
      e.facts.map((f) => [f.id, { kind: e.kind }] as const),
    ),
  );

  for (const source of globalReviewEvidence(profile))
    facts.set(source.id, { kind: source.scope });
  const errors: string[] = [];

  for (const row of rows) {
    const label = row.requirementQuote;

    if (!description.includes(label))
      errors.push("Nonliteral requirement: " + label);

    if (row.evidenceIds.some((id) => !facts.has(id)))
      errors.push("Unknown evidence: " + label);

    if (row.cvQuotes.some((q) => !q || !cvText.includes(q)))
      errors.push("Excerpt not found in CV: " + label);

    if (row.cvStatus !== "absent" && !row.cvQuotes.length)
      errors.push("CV coverage without excerpt: " + label);

    if (row.cvStatus === "absent" && row.cvQuotes.length)
      errors.push("Absent coverage with a present excerpt: " + label);

    if (
      ["professional", "personal"].includes(row.profileStatus) &&
      !row.evidenceIds.length
    )
      errors.push("Experience without evidence: " + label);

    if (
      row.profileStatus === "professional" &&
      row.evidenceIds.some((id) => facts.get(id)?.kind === "project")
    )
      errors.push("Personal project classified as professional: " + label);

    if (
      row.profileStatus === "professional" &&
      row.evidenceIds.some((id) => facts.get(id)?.kind === "study")
    )
      errors.push("Study classified as professional: " + label);

    if (
      row.profileStatus === "personal" &&
      row.evidenceIds.some((id) => facts.get(id)?.kind === "work")
    )
      errors.push("Professional experience classified as personal: " + label);

    if (
      row.missingParts.length &&
      ["professional", "personal", "study"].includes(row.profileStatus)
    )
      errors.push(
        "Incomplete requirement must be partial or unknown: " + label,
      );
  }

  return errors;
}

// Personal or studied knowledge is not automatically a gap: the JD may ask for
// knowledge rather than employment. Keep scope in coverage; only partial/unknown
// assessments (or explicitly missing components) belong in missingRequirements.
export function coverageMissing(rows: Coverage[]) {
  return rows
    .filter(
      (r) =>
        ["partial", "unknown"].includes(r.profileStatus) ||
        r.missingParts.length > 0,
    )
    .map(
      (r) =>
        `${r.requirementQuote} — ${r.profileStatus}: ${r.missingParts.length ? r.missingParts.join("; ") : r.explanation}`,
    );
}

export function validateActionableFeedback(
  review: z.infer<typeof actionableReviewSchema>,
  draft: Draft,
  profile: Profile,
) {
  const ids = new Set([
    ...profile.experiences.flatMap((e) => e.facts.map((f) => f.id)),
    ...globalReviewEvidence(profile).map((f) => f.id),
  ]);
  const text = [
    draft.summary,
    ...draft.experiences.flatMap((e) => e.bullets.map((b) => b.text)),
  ].join("\n");
  const errors: string[] = [];

  for (const i of review.issues) {
    if (i.exactQuote && !text.includes(i.exactQuote))
      errors.push("Feedback quotes absent text: " + i.exactQuote);

    if (i.evidenceIds.some((id) => !ids.has(id)))
      errors.push("Feedback cites unknown evidence: " + i.location);

    if (i.preserve.some((q) => !text.includes(q)))
      errors.push("Passage to preserve is absent: " + i.location);
  }

  return errors;
}

export function coverageFailure(review: Review, errors: string[]) {
  if (errors.length) {
    review.approved = false;
    review.issues.push(
      ...errors.map((problem) => ({
        severity: "blocking" as const,
        section: "Review audit",
        problem,
        fix: "Reassess traceability; do not change correct CV facts to justify the review.",
      })),
    );
  }
}
