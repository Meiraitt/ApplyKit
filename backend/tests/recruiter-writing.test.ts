import { describe, it, expect } from "vitest";
import { profileSchema, type Draft } from "../src/domain/types.js";
import { careerDuration } from "../src/domain/cv/cv-editorial.js";
import {
  assembleCv,
  validateEditorial,
  validateEvidence,
} from "../src/domain/cv/cv.js";
import { runGeminiCv } from "../src/services/cv/gemini-flow.js";

const profile = profileSchema.parse({
  name: "Teste",
  headline: "Dev",
  contact: {},
  summary: "",
  skills: ["React", "Node.js", "Datadog"],
  education: ["Graduação em sistemas | 2026", "Curso não relacionado | 2018"],
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
    {
      id: "b",
      company: "B",
      role: "Intern",
      period: "02/2020 - 08/2020",
      facts: [{ id: "b1", text: "Utilizou Datadog." }],
    },
  ],
});
const make = (): Draft => ({
  summary:
    "Desenvolvedor com mais de 3 anos de experiência profissional em aplicações web.",
  summaryEvidenceIds: ["a1"],
  skills: ["React"],
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
  presentation: {
    educationIndices: [0],
    technologySelections: [
      { sourceId: "a", technologies: ["React", "Node.js"] },
    ],
  },
});

describe("recruiter writing and factual safety", () => {
  it("does not interpret Web3 as a metric, but pinpoints invented percentages", () => {
    const d = make();

    d.experiences[0].bullets[0].text =
      "Implementei a hidratação de estado na aplicação Web3.";

    expect(
      validateEvidence(d, profile).some((i) =>
        i.includes("Unsupported number"),
      ),
    ).toBe(false);

    d.experiences[0].bullets[0].text =
      "Implementei a hidratação e reduzi erros em 35%.";

    const issues = validateEvidence(d, profile).join();

    expect(issues).toContain("35%");
    expect(issues).toContain(d.experiences[0].bullets[0].text);
    expect(issues).toContain("a1");
  });

  it("polishes optional feedback once, then stops even if preferences remain", async () => {
    let writes = 0,
      reviews = 0;
    const result = await runGeminiCv(
      async (role) => {
        if (role === "writer") {
          writes++;

          return { requirements: [], selectionReasons: [], draft: make() };
        }

        reviews++;

        return {
          approved: true,
          issues: [
            {
              severity: "suggestion",
              section: "a",
              problem: "Repetição editorial.",
              fix: "Remova a repetição sem alterar fatos.",
            },
          ],
          strengths: [],
          missingRequirements: [],
          questionsForCandidate: [],
        };
      },
      profile,
      {
        title: "Full Stack",
        description: "React e Node.js",
        language: "pt-BR",
      },
    );

    expect(writes).toBe(2);
    expect(reviews).toBe(2);
    expect(result.calls).toBe(4);
    expect(result.review.approved).toBe(true);
  });

  it("keeps first person without weakening endpoint authorship checks", () => {
    expect(validateEditorial(make(), "pt-BR", "first")).toEqual([]);
    expect(validateEvidence(make(), profile)).toEqual([]);
    const bad = make();

    bad.experiences[0].bullets[0].text =
      "Implementei um endpoint Node.js para salvar drafts.";

    expect(validateEvidence(bad, profile).join()).toContain(
      "Inflated endpoint authorship",
    );
  });

  it("detects invented outcomes in first person", () => {
    const bad = make();

    bad.experiences[0].bullets[0].text =
      "Otimizei as métricas LCP e CLS e garanti a estabilidade da aplicação.";

    expect(validateEvidence(bad, profile).join()).toContain(
      "Unsupported relationship",
    );

    expect(validateEvidence(bad, profile).join()).toContain(
      "Unconfirmed outcome guarantee",
    );
  });

  it("deduplicates tenure and excludes projects", () => {
    expect(careerDuration(profile)).toMatchObject({
      months: 45,
      completedYears: 3,
    });

    expect(
      careerDuration({
        ...profile,
        experiences: [{ ...profile.experiences[0], kind: "project" }],
      }).months,
    ).toBe(0);

    const bad = make();

    bad.summary = bad.summary.replace("3 anos", "5 anos");
    expect(validateEvidence(bad, profile).join()).toContain(
      "Unsupported number",
    );
  });

  it("selects education verbatim and never imports another company stack", () => {
    const d = make();

    expect(assembleCv(d, profile, "pt-BR").education).toEqual([
      profile.education[0],
    ]);

    d.presentation!.technologySelections[0].technologies = ["Datadog"];
    expect(validateEvidence(d, profile).join()).toContain(
      "Unsupported technology in company",
    );

    expect(assembleCv(d, profile, "pt-BR").experiences[0].technologies).toEqual(
      [],
    );

    expect(profile.education).toHaveLength(2);
  });

  it("uses source facts for selected technologies absent from the global catalog", () => {
    const p = structuredClone(profile);

    p.experiences.push({
      id: "personal",
      company: "Projeto pessoal",
      role: "Projeto",
      period: "",
      kind: "project",
      facts: [
        {
          id: "p1",
          text: "Implementou um projeto pessoal com Webpack Module Federation.",
        },
      ],
    });

    const d = make();

    d.experiences.push({
      sourceId: "personal",
      bullets: [
        {
          text: "Implementei um projeto pessoal com Webpack Module Federation.",
          evidenceIds: ["p1"],
        },
      ],
    });

    d.presentation!.technologySelections.push({
      sourceId: "personal",
      technologies: ["Webpack Module Federation"],
    });

    expect(validateEvidence(d, p)).toEqual([]);
    expect(assembleCv(d, p, "pt-BR").experiences.at(-1)?.technologies).toEqual([
      "Webpack Module Federation",
    ]);

    d.presentation!.technologySelections[0].technologies = [
      "Webpack Module Federation",
    ];

    expect(validateEvidence(d, p).join()).toContain(
      "Unsupported technology in company a",
    );

    expect(assembleCv(d, p, "pt-BR").experiences[0].technologies).toEqual([]);
  });

  it("preserves the new selection on a review-resume checkpoint", async () => {
    const d = make();
    let calls = 0;
    const result = await runGeminiCv(
      async (role) => {
        calls++;
        expect(role).toBe("reviewer");

        return {
          approved: true,
          issues: [],
          strengths: [],
          missingRequirements: [],
          questionsForCandidate: [],
        };
      },
      profile,
      {
        title: "Full Stack",
        description: "React e Node.js",
        language: "pt-BR",
      },
      {
        pendingReview: {
          draft: d,
          selection: {
            requirements: [],
            selectedSkills: d.skills,
            priorities: [],
          },
          round: 0,
        },
      },
    );

    expect(calls).toBe(1);
    expect(result.review.approved).toBe(true);
    expect(result.cv.education).toHaveLength(1);
    expect(result.draft.presentation).toEqual(d.presentation);
  });

  it("returns concrete editorial feedback to the writer before approving", async () => {
    let reviews = 0;
    const prompts: string[] = [];
    const result = await runGeminiCv(
      async (role, prompt) => {
        if (role === "writer") {
          prompts.push(prompt);

          return { requirements: [], selectionReasons: [], draft: make() };
        }

        return {
          approved: ++reviews > 1,
          issues:
            reviews === 1
              ? [
                  {
                    severity: "blocking",
                    section: "a",
                    problem: "Abertura genérica esconde a entrega principal.",
                    fix: "Destaque a restauração de drafts confirmada em a1.",
                  },
                ]
              : [],
          strengths: [],
          missingRequirements: [],
          questionsForCandidate: [],
        };
      },
      profile,
      {
        title: "Full Stack",
        description: "React e Node.js",
        language: "pt-BR",
      },
    );

    expect(result.calls).toBe(4);
    expect(result.review.approved).toBe(true);
    expect(prompts[1]).toContain("Abertura genérica");
  });
});
