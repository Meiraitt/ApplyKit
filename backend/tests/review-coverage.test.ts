import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { profileSchema } from "../src/domain/types.js";
import {
  validateCoverage,
  coverageMissing,
  validateActionableFeedback,
  actionableReviewSchema,
  coversRequirement,
  type Coverage,
} from "../src/domain/cv/review-coverage.js";
import {
  codexWriterPrompt,
  evidenceCases,
} from "../src/prompts/codex-prompts.js";
import { relationalIssues } from "../src/domain/cv/evidence-policy.js";

const p = profileSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/profile-review.json", import.meta.url),
      "utf8",
    ),
  ),
);
const row: Coverage = {
  requirementQuote: "Contribuir com Design System",
  profileStatus: "professional",
  evidenceIds: ["z3"],
  cvStatus: "demonstrated",
  cvQuotes: ["Evoluí os componentes reutilizáveis e o Design System."],
  missingParts: [],
  explanation: "Evolução confirmada na Cedar.",
};

describe("semantic review provenance", () => {
  it("accepts a literal requirement inside a reviewed compound without matching word fragments", () => {
    expect(coversRequirement("Git e publicação em nuvem", "Git")).toBe(true);
    expect(coversRequirement("GitHub Actions", "Git")).toBe(false);
    expect(coversRequirement("APIs REST e webhooks", "webhooks")).toBe(true);
  });

  it("allows separate optimization and measurement without permitting invented metric gains", () => {
    const facts = [
      { text: "Realizou otimizações de renderização." },
      { text: "Avaliou LCP, INP e CLS com Lighthouse." },
    ];

    expect(
      relationalIssues(
        "Otimizei a renderização e avaliei performance com Lighthouse e as métricas LCP, INP e CLS.",
        facts,
      ),
    ).toEqual([]);

    expect(
      relationalIssues(
        "Otimizei a renderização, melhorando LCP, INP e CLS.",
        facts,
      ).join(),
    ).toContain("Unsupported relationship");
  });

  it("does not use coordinated measurement in a source as proof of improved metrics", () => {
    expect(
      relationalIssues("Melhorei LCP.", [
        { text: "Otimizou a renderização e avaliou LCP." },
      ]).join(),
    ).toContain("Unsupported relationship");
  });

  it("separates an evaluation activity while still rejecting metric gains in either clause", () => {
    const facts = [
      { text: "Realizou otimizações de renderização e cache." },
      {
        text: "Trabalhou na avaliação de performance com Lighthouse e LCP, INP e CLS.",
      },
    ];

    expect(
      relationalIssues(
        "Otimizei renderização e cache no frontend e trabalhei na avaliação de performance com Lighthouse e as métricas LCP, INP e CLS.",
        facts,
      ),
    ).toEqual([]);

    for (const text of [
      "Melhorei LCP e trabalhei na avaliação de performance.",
      "Otimizei renderização e trabalhei na avaliação de performance, melhorando LCP.",
    ]) {
      expect(relationalIssues(text, facts).join()).toContain(
        "Unsupported relationship",
      );
    }

    expect(
      relationalIssues("Melhorei LCP.", [
        { text: "Otimizou renderização e trabalhou na avaliação de LCP." },
      ]).join(),
    ).toContain("Unsupported relationship");
  });

  it("preserves demonstrated paraphrases instead of recreating unknown gaps", () => {
    expect(
      validateCoverage([row], p, row.requirementQuote, row.cvQuotes[0]),
    ).toEqual([]);

    expect(coverageMissing([row])).toEqual([]);
  });

  it("does not call mixed requirements fully supported or studies professional", () => {
    const mixed = { ...row, missingParts: ["tokens e migrações de versão"] };

    expect(
      validateCoverage([mixed], p, row.requirementQuote, row.cvQuotes[0]),
    ).toHaveLength(1);

    expect(
      coverageMissing([{ ...mixed, profileStatus: "partial" }])[0],
    ).toContain("tokens");
  });

  it("rejects personal evidence promoted to employment", () => {
    const id = p.experiences.find((e) => e.kind === "project")!.facts[0].id;

    expect(
      validateCoverage(
        [{ ...row, evidenceIds: [id] }],
        p,
        row.requirementQuote,
        row.cvQuotes[0],
      ).join(),
    ).toContain("Personal project");
  });

  it("requires real source IDs, requirement and CV quotes", () => {
    expect(
      validateCoverage(
        [
          {
            ...row,
            requirementQuote: "inventado",
            evidenceIds: ["x"],
            cvQuotes: ["não existe"],
          },
        ],
        p,
        "Vaga",
        row.cvQuotes[0],
      ),
    ).toHaveLength(3);
  });

  it("keeps list presence separate from demonstrated delivery", () => {
    const listed = {
      ...row,
      cvStatus: "listed" as const,
      cvQuotes: ["Datadog"],
      evidenceIds: ["z9"],
    };

    expect(
      validateCoverage([listed], p, row.requirementQuote, "Datadog"),
    ).toEqual([]);

    expect(listed.cvStatus).toBe("listed");
  });

  it("does not demand both alternatives when reviewer supports React OR Vue", () => {
    const alternative = {
      ...row,
      requirementQuote: "React ou Vue",
      evidenceIds: ["z1"],
    };

    expect(
      validateCoverage([alternative], p, "React ou Vue", row.cvQuotes[0]),
    ).toEqual([]);

    expect(coverageMissing([alternative])).toEqual([]);
  });

  it("does not equate personal knowledge to a missing requirement", () => {
    expect(
      coverageMissing([
        {
          ...row,
          profileStatus: "personal",
          explanation: "Conhecimento em POO demonstrado em projeto pessoal.",
        },
      ]),
    ).toEqual([]);

    expect(
      coverageMissing([
        {
          ...row,
          profileStatus: "partial",
          missingParts: ["Experiência profissional exigida"],
        },
      ]),
    ).toHaveLength(1);
  });

  it("accepts a confirmed personal fact from global notes without assigning a company", () => {
    expect(
      validateCoverage(
        [{ ...row, profileStatus: "personal", evidenceIds: ["profile:notes"] }],
        p,
        row.requirementQuote,
        row.cvQuotes[0],
      ),
    ).toEqual([]);
  });

  it("rejects studies promoted to professional use", () => {
    expect(
      validateCoverage(
        [{ ...row, evidenceIds: ["profile:studies:0"] }],
        { ...p, studies: ["Supabase"] },
        row.requirementQuote,
        row.cvQuotes[0],
      ).join(),
    ).toContain("Study");
  });

  it("accepts only feedback grounded in actual text", () => {
    const draft = {
      summary: "Resumo profissional suficientemente longo",
      skills: [],
      experiences: [],
    };
    const review = actionableReviewSchema.parse({
      approved: false,
      issues: [
        {
          severity: "blocking",
          section: "Resumo",
          problem: "teste",
          fix: "teste",
          category: "factual",
          location: "summary",
          exactQuote: "Frase inexistente",
          evidenceIds: ["inventada"],
          minimalReplacement: "",
          preserve: [],
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
      coverage: [],
    });

    expect(validateActionableFeedback(review, draft, p)).toHaveLength(2);
  });

  it("sends source facts without cached CV phrases and maintains cases under fact reorder", () => {
    const reversed = {
      ...p,
      experiences: p.experiences.map((e) => ({
        ...e,
        facts: [...e.facts].reverse(),
      })),
    };

    expect(evidenceCases(reversed)).toEqual(evidenceCases(p));
    const prompt = codexWriterPrompt(p, {
      title: "Frontend",
      description: "React e Design System",
      language: "pt-BR",
    });

    expect(prompt).toContain("omitted alternative");
    expect(prompt).not.toContain("cvText");
    expect(prompt).toContain("Independent first version");
  });
});
