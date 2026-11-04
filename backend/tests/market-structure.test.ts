import { describe, it, expect } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import { assembleCv, validateEvidence } from "../src/domain/cv/cv.js";
import { professionalSummary } from "../src/domain/cv/professional-summary.js";
import { cvHtml } from "../src/infrastructure/documents/render.js";
import { requirementSupport } from "../src/domain/cv/tailoring.js";
import type { Draft } from "../src/domain/types.js";

describe("Structure, context and summary", () => {
  it("places technologies in their confirmed company and separates studies without invented delivery", async () => {
    const p = await loadProfile();
    const draft: Draft = {
      summary: "Desenvolvedor com experiência em interfaces React.",
      summaryEvidenceIds: ["l1"],
      skills: ["React", "PostgreSQL", "AWS", "Git"],
      experiences: p.experiences.slice(0, 3).map((e) => ({
        sourceId: e.id,
        bullets: [{ text: e.facts[0].cvText!, evidenceIds: [e.facts[0].id] }],
      })),
    };
    const cv = assembleCv(
      draft,
      p,
      "pt-BR",
      "Full Stack",
      "PostgreSQL ou Supabase, RLS e Edge Functions",
    );

    expect(cv.experiences[0].technologies).toContain("PostgreSQL");
    expect(cv.experiences[0].technologies).not.toContain("AWS");
    expect(cv.experiences[1].technologies).toContain("AWS");
    expect(cv.experiences[2].technologies).toContain("Git");
    expect(cv.experiences.every((e) => e.technologies?.includes("React"))).toBe(
      true,
    );

    expect(cv.experiences[1].technologies).toEqual(
      expect.arrayContaining([
        "Node.js",
        "Jest",
        "Vitest",
        "Testing Library",
        "Playwright",
        "Docker",
        "GitHub Actions",
        "Context API",
        "Zustand",
      ]),
    );

    expect(cv.experiences[2].technologies).toEqual(
      expect.arrayContaining([
        "React",
        "Next.js",
        "TypeScript",
        "JavaScript",
        "Cypress",
        "Jest",
        "Vitest",
        "Testing Library",
        "Git",
      ]),
    );

    expect(cv.experiences[2].technologies).not.toContain("NestJS");
    expect(cv.studies).toEqual(["Supabase", "Edge Functions", "RLS"]);
    const html = cvHtml(cv);

    expect(html).toContain("<h2>Competências</h2>");
    expect(html).not.toContain("Conhecimentos em estudo");
    expect(html.indexOf("Competências")).toBeLessThan(html.indexOf("Supabase"));
    expect(
      cv.experiences.every((e) => !e.technologies?.includes("Supabase")),
    ).toBe(true);

    expect(
      assembleCv(draft, p, "pt-BR", "Frontend", "React e testes").studies,
    ).toBeUndefined();

    expect(
      requirementSupport(p, "Experiência profissional com Supabase").supported,
    ).toBe(false);
  });

  it("synthesizes cross-company contributions without inferring test types from tools", async () => {
    const p = await loadProfile();
    const ids = ["l1", "l2", "l4", "k3", "k10", "z4", "k8"];
    const summary = professionalSummary(
      p,
      {
        title: "Frontend Pleno",
        description: "React, REST e testes",
        language: "pt-BR",
      },
      ids,
    )!;

    expect(summary.summary).toContain("componentes reutilizáveis");
    expect(summary.summary).toContain("APIs REST");
    expect(summary.summary).toContain("testes de aplicações");
    expect(summary.summary).not.toMatch(/draft|automatiz|unitári|produção/);
    expect(
      validateEvidence({ ...summary, skills: [], experiences: [] }, p),
    ).toEqual([]);

    expect(requirementSupport(p, "testes unitários").supported).toBe(false);
    expect(requirementSupport(p, "testes automatizados").supported).toBe(false);
    const partial = professionalSummary(
      p,
      { title: "Frontend", description: "React", language: "pt-BR" },
      ["l1", "l2"],
    );

    expect(partial).toBeUndefined();
  });
});

it("avoids accumulated prepositions and conjunctions in summaries", async () => {
  const p = await loadProfile();
  const summary = professionalSummary(
    p,
    {
      title: "Software Engineer",
      description: "Refatoração, algoritmos e bugs",
      language: "pt-BR",
    },
    ["l1", "l3", "l4", "k7", "k8", "k3", "k4", "z1", "z3", "z4"],
  )!;

  expect(summary.summary).toContain("integrações REST");
  expect(summary.summary).toContain(
    "componentes reutilizáveis e gerenciamento de estado",
  );

  expect(summary.summary).not.toContain("com integrações com");
  expect(
    validateEvidence({ ...summary, skills: [], experiences: [] }, p),
  ).toEqual([]);
});
