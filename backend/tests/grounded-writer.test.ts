import { describe, it, expect, vi } from "vitest";
import { writeGroundedDraft } from "../src/services/cv/writer.js";
import { validateEvidence, validateEditorial } from "../src/domain/cv/cv.js";
import {
  tailoringSchema,
  validateModelSelection,
} from "../src/domain/cv/tailoring.js";
import type { Profile } from "../src/domain/types.js";

const profile: Profile = {
  name: "Teste",
  headline: "Dev",
  contact: {},
  summary: "",
  skills: ["React", "TypeScript", "Node.js"],
  education: [],
  languages: [],
  notes: "Não atribuir Datadog à empresa A.",
  experiences: [
    {
      id: "a",
      company: "A",
      role: "Developer",
      period: "2025",
      kind: "work",
      facts: [
        {
          id: "a1",
          text: "Criou componentes reutilizáveis com React e TypeScript.",
          area: "frontend",
          cvText: "FRASE FIXA QUE NÃO DEVE SER USADA.",
        },
        {
          id: "a2",
          text: "Migrou o gerenciamento de estado de Context API para Zustand.",
          area: "frontend",
        },
        {
          id: "a3",
          text: "Trabalhou em um endpoint Node.js para salvar drafts.",
          area: "backend",
        },
      ],
    },
    {
      id: "p",
      company: "Projeto pessoal",
      role: "Projeto pessoal",
      period: "",
      kind: "project",
      facts: [
        {
          id: "p1",
          text: "Implementou BFF em projeto pessoal.",
          area: "backend",
        },
      ],
    },
  ],
};
const job = {
  title: "Frontend",
  company: "Teste",
  description: "React, componentes e gerenciamento de estado.",
  language: "pt-BR",
};
const selection = {
  requirements: [],
  selectedSkills: ["React"],
  priorities: [{ sourceId: "a", evidenceIds: ["a1", "a2"] }],
};
const bullets = [
  {
    text: "Criou componentes React e TypeScript e migrou o estado de Context API para Zustand.",
    evidenceIds: ["a1", "a2"],
  },
];
const summary = {
  summary:
    "Desenvolvedor com experiência em componentes React e TypeScript e gerenciamento de estado.",
  summaryEvidenceIds: ["a1", "a2"],
  skills: ["React", "TypeScript"],
};

describe("Original evidence-grounded writing", () => {
  it("always invokes the model and combines same-company evidence without fixed sentences", async () => {
    const before = JSON.stringify(profile),
      infer = vi
        .fn()
        .mockResolvedValueOnce({ bullets })
        .mockResolvedValueOnce(summary);
    const draft = await writeGroundedDraft(
      infer as any,
      "qwen",
      profile,
      job,
      undefined,
      undefined,
      selection,
    );

    expect(infer).toHaveBeenCalledTimes(2);
    expect(draft.experiences).toEqual([{ sourceId: "a", bullets }]);
    expect(draft.summary).toBe(summary.summary);
    expect(infer.mock.calls[0][1]).toContain(job.description);
    expect(infer.mock.calls[0][1]).not.toContain("FRASE FIXA");
    expect(infer.mock.calls[1][1]).not.toContain("FRASE FIXA");
    expect(JSON.stringify(profile)).toBe(before);
    expect(validateEvidence(draft, profile)).toEqual([]);
  });

  it("rejects evidence from another experience even when present in the profile", async () => {
    const infer = vi.fn().mockResolvedValue({
      bullets: [{ text: "Implementou BFF em produção.", evidenceIds: ["p1"] }],
    });

    await expect(
      writeGroundedDraft(
        infer as any,
        "qwen",
        profile,
        job,
        undefined,
        undefined,
        selection,
      ),
    ).rejects.toThrow();
  });

  it("requests authorship correction without fixed-text fallback", async () => {
    const infer = vi
      .fn()
      .mockResolvedValueOnce({
        bullets: [
          {
            text: "Implementou um endpoint Node.js para salvar drafts.",
            evidenceIds: ["a3"],
          },
        ],
      })
      .mockResolvedValueOnce({
        bullets: [
          {
            text: "Trabalhou em um endpoint Node.js para persistir drafts.",
            evidenceIds: ["a3"],
          },
        ],
      })
      .mockResolvedValueOnce({
        summary:
          "Desenvolvedor com experiência em um endpoint Node.js para persistência de drafts.",
        summaryEvidenceIds: ["a3"],
        skills: ["Node.js"],
      });
    const draft = await writeGroundedDraft(
      infer as any,
      "qwen",
      profile,
      { ...job, title: "Backend" },
      undefined,
      undefined,
      { ...selection, priorities: [{ sourceId: "a", evidenceIds: ["a3"] }] },
    );

    expect(infer.mock.calls[1][1]).toContain("<CORRIGIR>");
    expect(validateEvidence(draft, profile)).toEqual([]);
  });

  it("keeps persistent inventions blocked without prewritten fallback", async () => {
    const infer = vi.fn(async (_m: string, _p: string, schema: any) =>
      schema.shape.bullets
        ? {
            bullets: [
              {
                text: "Implementou um endpoint Node.js para salvar drafts.",
                evidenceIds: ["a3"],
              },
            ],
          }
        : {
            summary:
              "Desenvolvedor com experiência em um endpoint Node.js para salvar drafts.",
            summaryEvidenceIds: ["a3"],
            skills: ["Node.js"],
          },
    );
    const draft = await writeGroundedDraft(
      infer as any,
      "qwen",
      profile,
      job,
      undefined,
      undefined,
      selection,
    );

    expect(
      validateEvidence(draft, profile).some((i) =>
        i.includes("Inflated endpoint authorship"),
      ),
    ).toBe(true);

    expect(JSON.stringify(draft)).not.toContain("FRASE FIXA");
  });

  it("forwards editorial feedback and preserves selected personal projects", async () => {
    const plan = {
      ...selection,
      priorities: [{ sourceId: "p", evidenceIds: ["p1"] }],
    };
    const review = {
      approved: false,
      issues: [
        {
          severity: "blocking" as const,
          section: "p",
          problem: "Deixar claro o contexto pessoal",
          fix: "Preserve projeto pessoal.",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const infer = vi
      .fn()
      .mockResolvedValueOnce({
        bullets: [
          {
            text: "Implementou BFF em projeto pessoal de backend.",
            evidenceIds: ["p1"],
          },
        ],
      })
      .mockResolvedValueOnce({
        summary:
          "Desenvolvedor com prática de BFF em projeto pessoal de backend.",
        summaryEvidenceIds: ["p1"],
        skills: [],
      });
    const draft = await writeGroundedDraft(
      infer as any,
      "qwen",
      profile,
      job,
      review,
      undefined,
      plan,
    );

    expect(draft.experiences.map((e) => e.sourceId)).toEqual(["p"]);
    expect(infer.mock.calls[0][1]).toContain("Deixar claro o contexto pessoal");
  });

  it("validates selection without keyword-based reordering or padding", () => {
    const plan = {
      ...selection,
      priorities: [
        { sourceId: "p", evidenceIds: ["p1"] },
        { sourceId: "a", evidenceIds: ["a2", "a1"] },
      ],
    };

    expect(
      validateModelSelection(profile, plan, job.description).priorities,
    ).toEqual(plan.priorities);

    expect(() =>
      validateModelSelection(
        profile,
        { ...plan, priorities: [{ sourceId: "a", evidenceIds: ["p1"] }] },
        job.description,
      ),
    ).toThrow();
  });
});

it("links plans to employers and allows project omission without deleting facts", () => {
  const raw = {
    requirements: [],
    selectedSkills: ["React"],
    priorities: {
      a: {
        include: true,
        rationale: "Componentes e estado demonstram a função frontend.",
        evidenceIds: ["a2", "a1"],
      },
      p: {
        include: false,
        rationale: "BFF pessoal não é central para esta vaga frontend.",
        evidenceIds: [],
      },
    },
  };
  const schema = tailoringSchema(profile),
    parsed = schema.parse(raw);

  expect(parsed.priorities).toEqual([
    {
      sourceId: "a",
      rationale: raw.priorities.a.rationale,
      evidenceIds: ["a2", "a1"],
    },
  ]);

  expect(() =>
    schema.parse({
      ...raw,
      priorities: {
        ...raw.priorities,
        a: { ...raw.priorities.a, evidenceIds: ["p1"] },
      },
    }),
  ).toThrow();

  expect(() =>
    schema.parse({ ...raw, priorities: { a: raw.priorities.a } }),
  ).toThrow();
});

it("blocks assumed benefits without rejecting explicit confirmed results", () => {
  const draft = {
    ...summary,
    experiences: [
      {
        sourceId: "a",
        bullets: [
          {
            text: "Criou componentes reutilizáveis com React, garantindo qualidade.",
            evidenceIds: ["a1"],
          },
        ],
      },
    ],
  };

  expect(
    validateEvidence(draft, profile).some((i) =>
      i.includes("garantindo qualidade"),
    ),
  ).toBe(true);

  const confirmed = structuredClone(profile);

  confirmed.experiences[0].facts[0].text =
    "Criou componentes reutilizáveis com React e TypeScript, garantindo qualidade.";

  expect(validateEvidence(draft, confirmed)).toEqual([]);
  expect(
    validateEditorial(
      {
        ...draft,
        summary:
          "Desenvolvedor com experiência em React. Contribuí para interfaces web.",
      },
      "pt-BR",
    ),
  ).toEqual([]);
});

it("prevents personal projects from displacing recent work", () => {
  expect(() =>
    validateModelSelection(
      profile,
      { ...selection, priorities: [{ sourceId: "p", evidenceIds: ["p1"] }] },
      job.description,
    ),
  ).toThrow();

  const raw = {
    requirements: [],
    selectedSkills: [],
    priorities: {
      a: { include: false, rationale: "Omitir emprego.", evidenceIds: [] },
      p: { include: true, rationale: "Projeto.", evidenceIds: ["p1"] },
    },
  };

  expect(() => tailoringSchema(profile).parse(raw)).toThrow();
});

it("corrects only the feedback-targeted experience and preserves others", async () => {
  const prior = {
    ...summary,
    experiences: [
      { sourceId: "a", bullets },
      {
        sourceId: "p",
        bullets: [
          { text: "Implementou BFF em projeto pessoal.", evidenceIds: ["p1"] },
        ],
      },
    ],
  };
  const review = {
    approved: false,
    issues: [
      {
        severity: "blocking" as const,
        section: "p",
        problem: "Explicitar contexto.",
        fix: "Detalhar o contexto pessoal.",
      },
    ],
    strengths: [],
    missingRequirements: [],
    questionsForCandidate: [],
  };
  const infer = vi
    .fn()
    .mockResolvedValueOnce({
      bullets: [
        {
          text: "Implementou BFF em projeto pessoal de backend.",
          evidenceIds: ["p1"],
        },
      ],
    })
    .mockResolvedValueOnce(summary);
  const result = await writeGroundedDraft(
    infer as any,
    "qwen",
    profile,
    job,
    review,
    prior,
    {
      ...selection,
      priorities: [
        ...selection.priorities,
        { sourceId: "p", evidenceIds: ["p1"] },
      ],
    },
  );

  expect(result.experiences[0]).toEqual(prior.experiences[0]);
  expect(infer).toHaveBeenCalledTimes(2);
});

it("summary feedback does not rewrite experiences through shared evidence IDs", async () => {
  const prior = { ...summary, experiences: [{ sourceId: "a", bullets }] };
  const review = {
    approved: false,
    issues: [
      {
        severity: "blocking" as const,
        section: "Resumo",
        problem: "O resumo cita a1 e a2, mas precisa melhorar a síntese.",
        fix: "Sintetizar as contribuições.",
      },
    ],
    strengths: [],
    missingRequirements: [],
    questionsForCandidate: [],
  };
  const infer = vi.fn().mockResolvedValue(summary);
  const result = await writeGroundedDraft(
    infer as any,
    "qwen",
    profile,
    job,
    review,
    prior,
    selection,
  );

  expect(result.experiences).toEqual(prior.experiences);
  expect(infer).toHaveBeenCalledTimes(1);
});
