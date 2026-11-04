import { describe, it, expect } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import {
  validateEvidence,
  validateEditorial,
  assembleCv,
} from "../src/domain/cv/cv.js";
import { draftSchemaFor, type Draft } from "../src/domain/types.js";
import {
  experienceWriterPrompt,
  reviewerPrompt,
} from "../src/prompts/prompts.js";
import {
  requirementSupport,
  groundSelection,
  applyEditorialPriorities,
  reconcileMissing,
  reconcileQuestions,
} from "../src/domain/cv/tailoring.js";

const draft: Draft = {
  summary: "Desenvolvedor de aplicações React e TypeScript.",
  summaryEvidenceIds: ["k1"],
  skills: ["React", "TypeScript"],
  experiences: [
    {
      sourceId: "beacon",
      bullets: [
        {
          text: "Desenvolveu aplicações React e TypeScript para a Reading Harbor.",
          evidenceIds: ["k1"],
        },
      ],
    },
  ],
};

describe("Factual fidelity and editorial context", () => {
  it("does not confuse benefits or dependent age with technical requirements or career duration", async () => {
    const p = await loadProfile(),
      plan = {
        requirements: [
          { requirement: "creche R$687 até 5 anos", evidenceIds: [] },
          { requirement: "Experiência com Rust", evidenceIds: [] },
        ],
        selectedSkills: ["React"],
        priorities: [],
      };
    const grounded = groundSelection(
      p,
      plan,
      "Experiência com Rust; Benefícios: auxílio-creche R$687 até 5 anos.",
      "Frontend",
    );

    expect(grounded.requirements.map((r) => r.requirement)).toEqual([
      "Experiência com Rust",
    ]);

    expect(reconcileMissing(p, plan, [])).toEqual(["Experiência com Rust"]);
  });

  it("asks only about unresolved requirements without repeating invented assumptions", async () => {
    const p = await loadProfile(),
      plan = {
        requirements: [
          { requirement: "React", evidenceIds: ["k1"] },
          { requirement: "5 anos de React", evidenceIds: [] },
          { requirement: "auxílio-creche", evidenceIds: [] },
        ],
        selectedSkills: ["React"],
        priorities: [],
      };
    const questions = reconcileQuestions(
      p,
      [
        "Quais otimizações de lazy loading você implementou no backend Node.js na Beacon?",
      ],
      plan,
    );

    expect(questions).toEqual([
      'A vaga menciona: "5 anos de React". Do you have demonstrable experience in this area? If so, in what context?',
    ]);

    expect(questions.join(" ")).not.toContain("backend");
  });

  it("preserves hydration authorship without transferring it to endpoint implementation", async () => {
    const p = await loadProfile();
    const check = (text: string, id = "l4", sourceId = "atlas") =>
      validateEvidence(
        {
          ...draft,
          experiences: [{ sourceId, bullets: [{ text, evidenceIds: [id] }] }],
        },
        p,
      );

    for (const text of [
      "Desenvolveu um endpoint Node.js e NestJS para salvar drafts e implementou a hidratação do estado no frontend.",
      "Implemented a Node.js and NestJS endpoint to save drafts and implemented frontend state hydration.",
    ])
      expect(
        check(text).some((i) => i.includes("Inflated endpoint authorship")),
      ).toBe(true);
    expect(
      check(
        "Implementou um endpoint administrativo Node.js e NestJS para gerenciar permissões.",
        "l3",
      ).some((i) => i.includes("Inflated endpoint authorship")),
    ).toBe(true);

    expect(
      check(
        "Trabalhou em um endpoint Node.js e NestJS para salvar drafts e implementou a hidratação do estado no frontend.",
      ),
    ).toEqual([]);

    expect(
      check(
        "Implementou a hidratação do estado no frontend e trabalhou em um endpoint Node.js para salvar drafts.",
      ),
    ).toEqual([]);

    expect(
      check(
        "Worked on a Node.js and NestJS endpoint to save drafts and implemented frontend state hydration.",
      ),
    ).toEqual([]);

    expect(
      check(
        "Implementou um endpoint de leaderboard para a Reading Harbor no backend Node.js.",
        "k7",
        "beacon",
      ),
    ).toEqual([]);
  });

  it("detects semantic exaggeration and fragmented summaries", async () => {
    const p = await loadProfile(),
      base = { ...draft, summaryEvidenceIds: ["k3", "z3", "z4"] };

    expect(
      validateEvidence(
        {
          ...base,
          summary:
            "Developed reusable components and Design Systems for web applications.",
        },
        p,
      ).some((i) => i.includes("Unsupported design-system creation")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...base,
          summary:
            "Software developer with experience in reusable components and design system improvements.",
        },
        p,
      ),
    ).toEqual([]);

    expect(
      validateEvidence(
        {
          ...base,
          summary:
            "Integrated applications with REST APIs to enhance functionality and stability.",
        },
        p,
      ).some((i) => i.includes("stability")),
    ).toBe(true);

    expect(
      validateEditorial({
        ...base,
        summary: "Software Engineer, focusing on React and TypeScript.",
      }),
    ).toHaveLength(1);

    expect(
      validateEditorial({
        ...base,
        summary: "Desenvolveu endpoints e implementou interfaces.",
      }),
    ).toHaveLength(1);

    expect(
      validateEditorial(
        {
          ...base,
          summary: "Experienced software developer with experience in React.",
        },
        "pt-BR",
      ).some((i) => i.includes("Wrong language")),
    ).toBe(true);

    expect(
      validateEditorial(
        {
          ...base,
          summary: "Desenvolvedor com experiência em React e Node.js.",
        },
        "pt-BR",
      ),
    ).toEqual([]);

    const atlas = {
      ...draft,
      summaryEvidenceIds: ["l1"],
      experiences: [
        {
          sourceId: "atlas",
          bullets: [
            {
              text: "Implementou melhorias de UI/UX com React.",
              evidenceIds: ["l1"],
            },
          ],
        },
      ],
    };

    expect(assembleCv(atlas, p, "en").experiences[0].role).toBe(
      "Full Stack Developer",
    );

    expect(assembleCv(atlas, p, "pt-BR").experiences[0].role).toBe(
      "Full Stack Developer",
    );
  });

  it("does not turn frontend optimization into API performance claims", async () => {
    const profile = await loadProfile();
    const base = {
      ...draft,
      summaryEvidenceIds: ["l1", "l2", "l3", "k2", "k4"],
    };

    for (const summary of [
      "Desenvolvedor com Node.js e React. Realizou otimizações de performance em APIs REST.",
      "Software developer with React and Node.js. Optimized API performance.",
    ]) {
      expect(
        validateEvidence({ ...base, summary }, profile).some((i) =>
          i.includes("API/backend"),
        ),
      ).toBe(true);
    }

    expect(
      validateEvidence(
        {
          ...base,
          summary:
            "Desenvolvedor com React e Node.js. Realizou otimizações de renderização e cache no frontend e trabalhou em um endpoint administrativo.",
        },
        profile,
      ),
    ).toEqual([]);
  });

  it("does not copy job seniority into unsupported candidate positioning", async () => {
    const profile = await loadProfile();

    expect(
      validateEvidence(
        {
          ...draft,
          summary:
            "Software Engineer II with experience in React and TypeScript.",
        },
        profile,
      ).some((i) => i.includes("Unsupported seniority")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...draft,
          summary:
            "Software developer with experience in React and TypeScript.",
        },
        profile,
      ),
    ).toEqual([]);
  });

  it("blocks technologies transferred between employers despite global skill presence", async () => {
    const profile = await loadProfile();
    const bad = {
      ...draft,
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            { text: "Implementou endpoints com NestJS.", evidenceIds: ["k7"] },
          ],
        },
      ],
    };

    expect(
      validateEvidence(bad, profile).some((i) => i.includes("NestJS")),
    ).toBe(true);

    const good = {
      ...draft,
      experiences: [
        {
          sourceId: "atlas",
          bullets: [
            {
              text: "Trabalhou em um endpoint administrativo com Node.js e NestJS.",
              evidenceIds: ["l3"],
            },
          ],
        },
      ],
    };

    expect(validateEvidence(good, profile)).toEqual([]);
    const wrongDelivery = {
      ...draft,
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            {
              text: "Implementou endpoints administrativos com Node.js.",
              evidenceIds: ["k7"],
            },
          ],
        },
      ],
    };

    expect(
      validateEvidence(wrongDelivery, profile).some((i) =>
        i.includes("permission management"),
      ),
    ).toBe(true);
  });

  it("preserves metric units and excludes internal notes", async () => {
    const p = await loadProfile();

    expect(
      validateEvidence(
        {
          ...draft,
          summary: "Desenvolveu aplicações para 25 mil usuários ativos.",
        },
        p,
      ).some((i) => i.includes("qualifier")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...draft,
          summary: "Desenvolveu aplicações para 25 mil usuários cadastrados.",
        },
        p,
      ),
    ).toEqual([]);

    expect(
      validateEvidence(
        {
          ...draft,
          experiences: [
            {
              sourceId: "cedar-dev",
              bullets: [
                {
                  text: "Atuou em plataforma com 600 mil acessos mensais.",
                  evidenceIds: ["z8"],
                },
              ],
            },
          ],
        },
        p,
      ).some((i) => i.includes("peak")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...draft,
          experiences: [
            {
              sourceId: "atlas",
              bullets: [
                {
                  text: "Implementou stack registrada: React, TypeScript.",
                  evidenceIds: ["l5"],
                },
              ],
            },
          ],
        },
        p,
      ).some((i) => i.includes("Internal evidence note")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...draft,
          experiences: [
            {
              sourceId: "atlas",
              bullets: [
                {
                  text: "Implementou endpoints administrativos com Node.js.",
                  evidenceIds: ["l3"],
                },
              ],
            },
          ],
        },
        p,
      ).some((i) => i.includes("singular")),
    ).toBe(true);

    expect(
      validateEvidence(
        {
          ...draft,
          experiences: [
            {
              sourceId: "cedar-dev",
              bullets: [
                {
                  text: "Documentou tarefas em BDD usando Cypress e Jest.",
                  evidenceIds: ["z6"],
                },
              ],
            },
          ],
        },
        p,
      ).some((i) => i.includes("documentation")),
    ).toBe(true);
  });

  it("preserves alternatives and distinguishes study from employment", async () => {
    const p = await loadProfile();

    expect(requirementSupport(p, "PostgreSQL ou Supabase").supported).toBe(
      true,
    );

    expect(requirementSupport(p, "PostgreSQL e Supabase").supported).toBe(
      false,
    );

    expect(requirementSupport(p, "Supabase").supported).toBe(false);
    const plan = groundSelection(
      p,
      {
        requirements: [
          { requirement: "mais de 2 anos com Node.js", evidenceIds: ["k2"] },
        ],
        selectedSkills: ["React"],
        priorities: [],
      },
      "mais de 2 anos com Node.js",
    );

    expect(plan.requirements[0].evidenceIds).toEqual([]);
    const personal = {
      ...p,
      skills: ["Rust"],
      experiences: [
        {
          ...p.experiences[0],
          kind: "project" as const,
          facts: [{ id: "p1", text: "Criou um projeto pessoal com Rust." }],
        },
      ],
    };

    expect(
      requirementSupport(personal, "Experiência profissional com Rust")
        .supported,
    ).toBe(false);
  });

  it("preserves historical roles and facts and supplies the full job to review", async () => {
    const p = await loadProfile(),
      job = {
        title: "Front-end",
        company: "Teste",
        description: "Prioridade: testes e interfaces React.",
        language: "pt-BR",
      };
    const feedback = {
      approved: true,
      issues: [],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const rewrite = experienceWriterPrompt(
      p.experiences[0],
      p.experiences[0].facts,
      job,
      feedback,
      draft,
    );

    expect(rewrite).toContain(job.title);
    expect(rewrite).not.toContain(job.description);
    expect(rewrite).toContain("Never invent technologies");
    expect(rewrite).toContain("<PREVIOUS>");
    expect(reviewerPrompt(p, job, draft)).toContain(job.description);
  });

  it("permits one internship bullet and adapts the headline without changing historical titles", async () => {
    const p = await loadProfile();
    const intern = p.experiences.find((e) => e.id === "cedar-intern")!;
    const focused = { ...p, experiences: [intern] };
    const short = {
      ...draft,
      summaryEvidenceIds: ["i1"],
      experiences: [
        {
          sourceId: intern.id,
          bullets: [
            {
              text: "Desenvolveu funcionalidades com React e TypeScript.",
              evidenceIds: ["i1"],
            },
          ],
        },
      ],
    };

    expect(draftSchemaFor(focused, true).safeParse(short).success).toBe(true);
    const cv = assembleCv(draft, p, "pt-BR", "Desenvolvedor Front-end Pleno");

    expect(cv.headline).toBe("Desenvolvedor Front-end | React | TypeScript");
    expect(cv.experiences[0].role).toBe("Software Engineer");
    expect(
      draftSchemaFor(p).safeParse({
        ...draft,
        experiences: [
          {
            sourceId: "beacon",
            bullets: [
              {
                text: "Trabalhou em um endpoint administrativo.",
                evidenceIds: ["l3"],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("preserves recent work and duration requirements omitted by selection", async () => {
    const p = await loadProfile();
    const plan = groundSelection(
      p,
      {
        requirements: [{ requirement: "React", evidenceIds: ["k1"] }],
        selectedSkills: ["React"],
        priorities: [{ sourceId: "beacon", evidenceIds: ["k3"] }],
      },
      "React; mais de 2 anos de experiência profissional com Node.js",
    );

    expect(plan.priorities.map((p) => p.sourceId)).toEqual([
      "atlas",
      "beacon",
      "cedar-dev",
    ]);

    expect(
      plan.requirements.find((r) => r.requirement.includes("2 anos"))
        ?.evidenceIds,
    ).toEqual([]);

    expect(requirementSupport(p, "APIs REST").supported).toBe(true);
    expect(requirementSupport(p, "testes automatizados").supported).toBe(false);
    p.education = [
      "Example College — Ciência da Computação | conclusão prevista em 2030",
    ];

    expect(
      requirementSupport(
        p,
        "graduação completa ou em andamento em Ciência da Computação",
      ).supported,
    ).toBe(true);
  });

  it("prioritizes central responsibilities without turning context into contributions", async () => {
    const p = await loadProfile(),
      plan = { requirements: [], selectedSkills: ["React"], priorities: [] };
    const frontend = groundSelection(
      p,
      plan,
      "React, Node.js, testes e interfaces",
      "Front-end Pleno",
    );
    const atlas = frontend.priorities.find(
      (p) => p.sourceId === "atlas",
    )!.evidenceIds;

    expect(atlas).toContain("l4");
    expect(atlas).not.toContain("l3");
    const beacon = frontend.priorities.find(
      (p) => p.sourceId === "beacon",
    )!.evidenceIds;

    expect(beacon).toContain("k3");
    expect(beacon).toContain("k10");
    expect(beacon).not.toContain("k11");
    const fullstack = groundSelection(
      p,
      plan,
      "Node.js, React e APIs",
      "Node.js e React Júnior",
    );

    expect(
      fullstack.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
    ).toEqual(expect.arrayContaining(["k7", "k8"]));

    expect(fullstack.priorities.flatMap((p) => p.evidenceIds)).not.toContain(
      "z8",
    );
  });

  it("permits evidence substitution during editorial review without invented IDs", async () => {
    const p = await loadProfile();
    const plan = {
      requirements: [],
      selectedSkills: ["React"],
      priorities: [
        { sourceId: "beacon", evidenceIds: ["k1", "k2", "k3", "k4"] },
      ],
    };
    const review = {
      approved: true,
      issues: [
        {
          severity: "suggestion" as const,
          section: "Beacon",
          problem: "Testes omitidos",
          fix: "Priorize k10. Não inventar o ID inexistente.",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const revised = applyEditorialPriorities(p, plan, review);

    expect(revised.priorities[0].evidenceIds).toEqual([
      "k10",
      "k1",
      "k2",
      "k3",
    ]);

    expect(plan.priorities[0].evidenceIds).toEqual(["k1", "k2", "k3", "k4"]);
  });
});
