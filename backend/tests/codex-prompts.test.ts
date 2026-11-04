import { describe, expect, it } from "vitest";
import { assembleCv } from "../src/domain/cv/cv.js";
import { profileSchema, type Draft } from "../src/domain/types.js";
import {
  codexReviewDocument,
  codexReviewerPrompt,
  codexTechnologyOptions,
  codexWriterPrompt,
} from "../src/prompts/codex-prompts.js";

const profile = profileSchema.parse({
  name: "Candidate",
  headline: "Developer",
  contact: {},
  summary: "",
  notes: "Global knowledge; no employer attribution.",
  skills: ["React", "Git"],
  studies: ["Supabase"],
  education: ["Degree"],
  languages: [],
  experiences: ["recent", "older"].map((id) => ({
    id,
    company: "Same employer",
    role: "Dev",
    period: id,
    kind: "work",
    facts: [{ id: `${id}1`, text: `Implemented React interfaces in ${id}.` }],
  })),
});
const job = {
  title: "Frontend",
  description: "React, Git and Supabase",
  language: "en" as const,
};
const draft: Draft = {
  summary:
    "Developer with professional experience implementing React interfaces.",
  summaryEvidenceIds: ["recent1"],
  skills: ["React", "Git"],
  // Deliberately reversed: rendered order follows the profile, not draft order.
  experiences: ["older", "recent"].map((id) => ({
    sourceId: id,
    bullets: [
      {
        text: `Implemented React interfaces in ${id}.`,
        evidenceIds: [`${id}1`],
      },
    ],
  })),
  presentation: { educationIndices: [0], technologySelections: [] },
};
const selection = {
  requirements: [{ requirement: "React", evidenceIds: ["recent1"] }],
  selectedSkills: ["Git"],
  priorities: [
    { sourceId: "recent", evidenceIds: ["recent1"], rationale: "WRITER_BIAS" },
  ],
};

describe("compact CV context", () => {
  it("does not turn global skills into employer-specific technology options", () => {
    const options = codexTechnologyOptions(profile);

    expect(options.recent).toEqual(["React"]);
    expect(options.older).toEqual(["React"]);
    expect(profile.skills).toContain("Git");
    expect(codexWriterPrompt(profile, job)).toContain("ALLOWED_TECHNOLOGIES");
  });

  it("keeps every factual source and global note available independently", () => {
    const writer = codexWriterPrompt(profile, job);
    const reviewer = codexReviewerPrompt(profile, job, draft, selection, []);

    for (const prompt of [writer, reviewer]) {
      for (const experience of profile.experiences)
        for (const fact of experience.facts)
          expect(prompt).toContain(fact.text);
      expect(prompt).toContain(profile.notes);
      expect(prompt).toContain("Supabase");
    }

    expect(reviewer).not.toContain("WRITER_BIAS");
    expect(reviewer).toContain("profile:notes");
    expect(reviewer).toContain("profile:studies:0");
  });

  it("preserves rendered content and stable provenance despite reordered drafts", () => {
    const document = codexReviewDocument(profile, job, draft);
    const rendered = assembleCv(
      draft,
      profile,
      job.language,
      job.title,
      job.description,
    );

    expect(document.summary.text).toBe(rendered.summary);
    expect(
      document.experiences.map((e) => e.bullets.map((b) => b.text)),
    ).toEqual(rendered.experiences.map((e) => e.bullets));

    expect(document.experiences[0].bullets[0]).toMatchObject({
      location: "recent.bullets.0",
      evidenceIds: ["recent1"],
    });

    expect(document.experiences[1].bullets[0]).toMatchObject({
      location: "older.bullets.0",
      evidenceIds: ["older1"],
    });

    expect(document.studies).toEqual(["Supabase"]);
    expect(document).not.toHaveProperty("skills");
    expect(JSON.stringify(document)).not.toContain("Git");
    expect(JSON.stringify(document).split(draft.summary)).toHaveLength(2);
  });

  it("preserves actionable repair feedback without retransmitting coverage prose", () => {
    const review = {
      approved: false,
      issues: [
        {
          severity: "blocking" as const,
          section: "recent",
          problem: "Unsupported authorship",
          fix: "Keep contribution scope",
        },
      ],
      strengths: ["REDUNDANT_STRENGTH"],
      missingRequirements: ["UNRELATED_FIT_GAP"],
      questionsForCandidate: ["Unanswered question"],
    };
    const prompt = codexWriterPrompt(profile, job, { draft, review });

    expect(prompt).toContain("Unsupported authorship");
    expect(prompt).toContain("Unanswered question");
    expect(prompt).not.toContain("REDUNDANT_STRENGTH");
    expect(prompt).not.toContain("UNRELATED_FIT_GAP");
  });
});
