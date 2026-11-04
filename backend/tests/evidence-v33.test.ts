import { it, expect, vi } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import {
  groundSelection,
  reconcileMissing,
  requirementSupport,
  applyEditorialPriorities,
} from "../src/domain/cv/tailoring.js";
import { auditBullets } from "../src/services/cv/reviewer.js";
import {
  verifyExtractedText,
  expectedPdfBlocks,
  renderArtifacts,
} from "../src/infrastructure/documents/render.js";
import { professionalSummary } from "../src/domain/cv/professional-summary.js";
import { assembleCv, validateEvidence } from "../src/domain/cv/cv.js";

it("distinguishes responsibilities and does not treat empty analysis as gap-free", async () => {
  const p = await loadProfile();
  const plan = (requirement: string) =>
    groundSelection(
      p,
      {
        requirements: [{ requirement, evidenceIds: [] }],
        selectedSkills: ["React"],
        priorities: [],
      },
      requirement,
      "Frontend Pleno",
    );
  const performance = plan("otimizações de renderização"),
    testing = plan("testes");

  expect(
    performance.priorities.find((e) => e.sourceId === "atlas")!.evidenceIds[0],
  ).toBe("l2");

  expect(
    testing.priorities.find((e) => e.sourceId === "beacon")!.evidenceIds[0],
  ).toBe("k10");

  expect(
    reconcileMissing(
      p,
      { requirements: [], selectedSkills: [], priorities: [] },
      [],
    )[0],
  ).toContain("Inconclusive");
});

it("rejects audits that repeat one bullet and omit another", async () => {
  const p = await loadProfile(),
    e = p.experiences[0];
  const draft = {
    summary: "Resumo profissional com fatos confirmados.",
    skills: [],
    experiences: [
      {
        sourceId: e.id,
        bullets: e.facts
          .slice(0, 2)
          .map((f) => ({ text: f.cvText ?? f.text, evidenceIds: [f.id] })),
      },
    ],
  };
  const infer = vi.fn().mockResolvedValue({
    bullets: {
      "0": {
        decision: "keep",
        reason: "Demonstra uma entrega relevante.",
        replacementEvidenceIds: [],
      },
    },
  });

  await expect(
    auditBullets(infer as any, "mock", p, {}, draft),
  ).rejects.toThrow();

  expect(infer).toHaveBeenCalledTimes(2);
});

it("detects lost content, joined words and changed PDF extraction order", async () => {
  const p = await loadProfile(),
    e = p.experiences[0],
    f = e.facts[0];
  const cv = assembleCv(
    {
      summary: "Desenvolvedor com experiência em React e TypeScript.",
      skills: [],
      experiences: [
        {
          sourceId: e.id,
          bullets: [{ text: f.cvText ?? f.text, evidenceIds: [f.id] }],
        },
      ],
    },
    p,
    "pt-BR",
    "Frontend",
    "React",
  );
  const blocks = expectedPdfBlocks(cv),
    text = blocks.join(" ");

  expect(verifyExtractedText(text, cv)).toBe(blocks.length);
  expect(() =>
    verifyExtractedText(text.replace("React e", "Reacte"), cv),
  ).toThrow();

  expect(() =>
    verifyExtractedText(blocks.slice().reverse().join(" "), cv),
  ).toThrow();

  expect(() =>
    verifyExtractedText(text.replace(cv.experiences[0].bullets[0], ""), cv),
  ).toThrow();
});

it("does not infer AI, SOLID or test types from generic tools or features", async () => {
  const p = await loadProfile();

  for (const requirement of [
    "Integrar recursos de IA (APIs de LLM) às funcionalidades",
    "Escrever testes unitários, integração e E2E",
    "Aplicar princípios SOLID e code review",
  ])
    expect(requirementSupport(p, requirement).known).toBe(false);
});

it("does not turn alternative requirements into separate mandatory gaps", async () => {
  const p = await loadProfile(),
    requirement = "Node.js ou Python";
  const plan = groundSelection(
    p,
    {
      requirements: [{ requirement, evidenceIds: [] }],
      selectedSkills: ["Node.js"],
      priorities: [],
    },
    requirement,
    "Full Stack",
  );

  expect(plan.requirements.map((r) => r.requirement)).toEqual([requirement]);
  expect(reconcileMissing(p, plan, [])).toEqual([]);
});

it("prioritizes direct QA over auxiliary backend lookups when quality matters", async () => {
  const p = await loadProfile(),
    requirement = "Escrever testes e validar dados";
  const plan = groundSelection(
    p,
    {
      requirements: [{ requirement, evidenceIds: [] }],
      selectedSkills: ["React"],
      priorities: [],
    },
    requirement,
    "Full Stack Júnior",
  );
  const ids = plan.priorities.find(
    (e) => e.sourceId === "cedar-dev",
  )!.evidenceIds;

  expect(ids).toContain("z6");
  expect(ids).not.toContain("z7");
});

it("supports plural endpoint claims using all cited contributions", async () => {
  const p = await loadProfile(),
    summary = professionalSummary(
      p,
      {
        title: "Full Stack",
        description: "APIs REST e backend",
        language: "pt-BR",
      },
      ["l1", "l3", "l4", "k7", "k2", "k4", "z4"],
    )!;

  expect(summary.summaryEvidenceIds).toEqual(
    expect.arrayContaining(["l3", "l4", "k7"]),
  );

  expect(
    validateEvidence({ ...summary, skills: [], experiences: [] }, p),
  ).toEqual([]);
});

it("preserves components and state evidence over repeated stack and scale", async () => {
  const p = await loadProfile(),
    description =
      "React, TypeScript, APIs REST, testes, performance e arquitetura frontend";
  const plan = groundSelection(
    p,
    {
      requirements: [{ requirement: description, evidenceIds: [] }],
      selectedSkills: ["React"],
      priorities: [],
    },
    description,
    "Frontend React Pleno",
  );

  expect(
    plan.priorities.find((e) => e.sourceId === "beacon")!.evidenceIds,
  ).toContain("k3");
});

it("replaces the requested bullet and preserves the others", async () => {
  const p = await loadProfile(),
    plan = {
      requirements: [],
      selectedSkills: [],
      priorities: [
        { sourceId: "cedar-dev", evidenceIds: ["z1", "z7", "z3", "z4"] },
      ],
    };
  const review = {
    approved: true,
    issues: [],
    strengths: [],
    missingRequirements: [],
    questionsForCandidate: [],
    bulletAudit: [
      {
        sourceId: "cedar-dev",
        bulletIndex: 1,
        decision: "replace" as const,
        reason: "Testes são mais relevantes que consulta auxiliar.",
        replacementEvidenceIds: ["z6"],
      },
    ],
  };

  expect(
    applyEditorialPriorities(p, plan, review).priorities[0].evidenceIds,
  ).toEqual(["z1", "z6", "z3", "z4"]);
});

it("does not promote auxiliary support based on backend keyword coincidences", async () => {
  const p = await loadProfile(),
    requirements = ["backend", "QA", "React", "Git", "testes", "APIs REST"].map(
      (requirement) => ({ requirement, evidenceIds: [] }),
    ),
    description = requirements.map((r) => r.requirement).join(", ");

  for (const title of ["Full Stack", "Frontend React"]) {
    const plan = groundSelection(
      p,
      { requirements, selectedSkills: ["React"], priorities: [] },
      description,
      title,
    );

    expect(
      plan.priorities.find((e) => e.sourceId === "cedar-dev")!.evidenceIds,
    ).not.toContain("z7");
  }
});
