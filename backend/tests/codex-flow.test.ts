import { describe, it, expect } from "vitest";
import { runCodexCv } from "../src/services/cv/codex-flow.js";
import { profileSchema, type Draft } from "../src/domain/types.js";

const p = profileSchema.parse({
  name: "Teste",
  headline: "Dev",
  contact: {},
  summary: "",
  skills: ["React", "Node.js"],
  education: ["Sistemas"],
  languages: [],
  experiences: [
    {
      id: "a",
      company: "A",
      role: "Dev",
      period: "02/2020 - 10/2023",
      facts: [
        {
          id: "a1",
          text: "Trabalhou em um endpoint Node.js para salvar drafts e implementou a hidratação do estado no frontend com React.",
        },
      ],
    },
  ],
});
const job = {
  title: "Full Stack",
  description: "React e Node.js",
  language: "pt-BR" as const,
};
const draft = (): Draft => ({
  summary:
    "Desenvolvedor com experiência em aplicações web com React e Node.js.",
  summaryEvidenceIds: ["a1"],
  skills: ["React", "Node.js"],
  experiences: [
    {
      sourceId: "a",
      bullets: [
        {
          text: "Implementei a hidratação do estado no frontend com React e contribuí para o salvamento de drafts no backend Node.js.",
          evidenceIds: ["a1"],
        },
      ],
    },
  ],
  presentation: { educationIndices: [0], technologySelections: [] },
});
const writer = (d = draft()) => ({
  plan: { topNeeds: [], choices: [] },
  requirements: [{ requirement: "React e Node.js", evidenceIds: ["a1"] }],
  selectionReasons: [],
  draft: d,
});
const review = () => ({
  approved: true,
  issues: [],
  strengths: [],
  missingRequirements: [],
  questionsForCandidate: [],
  coverage: [
    {
      requirementQuote: job.description,
      profileStatus: "professional",
      evidenceIds: ["a1"],
      cvStatus: "demonstrated",
      cvQuotes: [draft().experiences[0].bullets[0].text],
      missingParts: [],
      explanation: "Ambas confirmadas, preservando autoria por ação.",
    },
  ],
});

describe("Codex autonomous loop", () => {
  it("reviews the selected lead in its printed position without changing the other evidence", async () => {
    const profile = structuredClone(p);

    profile.experiences[0].facts.push({
      id: "a2",
      text: "Criou componentes reutilizáveis com React.",
    });

    const d = draft();
    const lead = {
      text: "Criei componentes reutilizáveis com React.",
      evidenceIds: ["a2"],
    };
    const other = d.experiences[0].bullets[0];

    d.experiences[0].bullets.push(lead);
    const result = await runCodexCv(
      async (role, prompt) => {
        if (role === "writer")
          return {
            ...writer(d),
            plan: {
              topNeeds: [],
              choices: [
                {
                  sourceId: "a",
                  leadEvidenceIds: ["a2"],
                  firstBulletReason: "React",
                  omittedAlternativeIds: [],
                  omissionReason: "",
                },
              ],
            },
          };
        const printed = JSON.parse(prompt.split("<CV>")[1].split("</CV>")[0]);

        expect(printed.experiences[0].bullets[0]).toMatchObject({
          text: lead.text,
          location: "a.bullets.0",
          evidenceIds: ["a2"],
        });

        return review();
      },
      profile,
      job,
    );

    expect(result.cv.experiences[0].bullets).toEqual([lead.text, other.text]);
    expect(result.draft.experiences[0].bullets).toEqual([lead, other]);
  });

  it("retains optional suggestions without rewriting an approved CV", async () => {
    let calls = 0;
    const result = await runCodexCv(
      async (role) => {
        calls++;

        if (role === "writer") return writer();
        const r: any = review();

        r.issues = [
          {
            severity: "suggestion",
            category: "editorial",
            section: "Resumo",
            location: "summary",
            exactQuote: draft().summary,
            evidenceIds: ["a1"],
            minimalReplacement: draft().summary,
            preserve: [],
            problem: "Optional wording preference, no material defect.",
            fix: "Keep the factual meaning.",
          },
        ];

        return r;
      },
      p,
      job,
    );

    expect(calls).toBe(2);
    expect(result.review.approved).toBe(true);
    expect(result.review.issues).toHaveLength(1);
    expect(result.draft).toEqual(draft());
  });

  it("returns exact reviewer feedback to writer, then verifies corrected CV", async () => {
    let writes = 0,
      reviews = 0;
    const bad = draft();

    bad.experiences[0].bullets[0].text =
      "Implementei um endpoint Node.js para salvar drafts.";

    const result = await runCodexCv(
      async (role, prompt) => {
        if (role === "writer") {
          writes++;

          if (writes === 2) {
            expect(prompt).toContain("Inflated endpoint authorship");
            expect(prompt).toContain("a1");
          }

          return writer(writes === 1 ? bad : draft());
        }

        reviews++;
        const r: any = review();

        if (reviews === 1) {
          r.coverage[0].cvQuotes = [bad.experiences[0].bullets[0].text];
          r.approved = false;
          r.issues = [
            {
              severity: "blocking",
              section: "a",
              problem: "Autoria ampliada no endpoint.",
              fix: "Preserve participação no backend e implementação na hidratação.",
              category: "factual",
              location: "a.bullets.0",
              exactQuote: bad.experiences[0].bullets[0].text,
              evidenceIds: ["a1"],
              minimalReplacement: draft().experiences[0].bullets[0].text,
              preserve: [],
            },
          ];
        }

        return r;
      },
      p,
      job,
    );

    expect(result.calls).toBe(4);
    expect(result.review.approved).toBe(true);
    expect(result.review.missingRequirements).toEqual([]);
  });

  it("never approves invalid coverage after three rounds", async () => {
    const result = await runCodexCv(
      async (role) => {
        if (role === "writer") return writer();
        const r: any = review();

        r.coverage[0].evidenceIds = ["invented"];

        return r;
      },
      p,
      job,
    );

    expect(result.calls).toBe(4);
    expect(result.review.approved).toBe(false);
    expect(
      result.review.issues.some((i) => i.problem.includes("Unknown evidence")),
    ).toBe(true);
  });

  it("corrects reviewer-only errors without rewriting the CV", async () => {
    let writes = 0,
      reviews = 0;
    const result = await runCodexCv(
      async (role, prompt) => {
        if (role === "writer") {
          writes++;

          return writer();
        }

        reviews++;
        const r: any = review();

        if (reviews === 1) r.coverage[0].cvQuotes = ["Git"];
        else expect(prompt).toContain("REVIEW CORRECTION");

        return r;
      },
      p,
      job,
    );

    expect(writes).toBe(1);
    expect(reviews).toBe(2);
    expect(result.review.approved).toBe(true);
    expect(result.draft).toEqual(draft());
  });

  it("resumes review only without losing selected presentation", async () => {
    const result = await runCodexCv(
      async (role) => {
        expect(role).toBe("reviewer");

        return review();
      },
      p,
      job,
      {
        pendingReview: {
          draft: draft(),
          selection: {
            requirements: writer().requirements,
            priorities: [],
            selectedSkills: [],
          },
          round: 0,
        },
      },
    );

    expect(result.calls).toBe(1);
    expect(result.review.approved).toBe(true);
    expect(result.draft.presentation).toEqual(draft().presentation);
  });
});
