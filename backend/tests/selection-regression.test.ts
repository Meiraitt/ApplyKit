import { describe, it, expect } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import {
  groundSelection,
  requirementSupport,
  emphasizesLifecycle,
} from "../src/domain/cv/tailoring.js";
import { evidenceSummary } from "../src/services/cv/writer.js";

describe("Role-tailoring regression cases", () => {
  it("includes end-to-end full-stack delivery while preserving test coverage", async () => {
    const profile = await loadProfile();
    const plan = groundSelection(
      profile,
      {
        requirements: [],
        selectedSkills: ["React", "Node.js"],
        priorities: [],
      },
      "Criar soluções completas, unindo desenvolvimento back-end e front-end. APIs e testes.",
      "Desenvolvedor Full Stack Pleno",
    );

    expect(
      plan.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
    ).toContain("k2");

    expect(
      plan.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
    ).not.toContain("k10");

    expect(plan.priorities.some((p) => p.evidenceIds.includes("z6"))).toBe(
      true,
    );

    expect(
      emphasizesLifecycle(
        "Frontend Pleno",
        "Soluções completas frontend e backend",
      ),
    ).toBe(false);

    expect(
      emphasizesLifecycle("Full Stack", "Interfaces React e APIs Node.js"),
    ).toBe(false);

    expect(
      emphasizesLifecycle(
        "Full Stack Pleno",
        "Node.js, React e colaboração com produto e arquitetos.",
      ),
    ).toBe(true);

    const summary = evidenceSummary(
      profile,
      {
        title: "Full Stack Pleno",
        company: "Teste",
        language: "pt-BR",
        description: "Soluções completas unindo frontend e backend.",
      },
      plan.priorities.flatMap((p) => p.evidenceIds),
      true,
    )!;

    expect(summary.summary).toContain("entregas ponta a ponta");
    expect(summary.summary).toContain("além de componentes reutilizáveis");
    expect(summary.summary).not.toMatch(/blockchain|QA|BDD/);
    expect(summary.summaryEvidenceIds).toContain("k2");
    expect(summary.summaryEvidenceIds).toContain("k3");
  });

  it("recognizes basic SQL/PostgreSQL without inferring advanced knowledge", async () => {
    const profile = await loadProfile();
    const basic = requirementSupport(profile, "SQL/PostgreSQL");

    expect(basic.supported).toBe(true);
    expect(basic.evidenceIds).toContain("k11");
    expect(requirementSupport(profile, "SQL avançado/PostgreSQL").known).toBe(
      false,
    );

    expect(requirementSupport(profile, "3 anos de SQL/PostgreSQL").known).toBe(
      false,
    );

    expect(requirementSupport(profile, "SQL Server").supported).toBe(false);
  });
});

it("prioritizes concrete delivery while preserving quality evidence elsewhere", async () => {
  const profile = await loadProfile();
  const plan = groundSelection(
    profile,
    { requirements: [], selectedSkills: ["React", "Node.js"], priorities: [] },
    "Desenvolver funcionalidades ponta a ponta do banco à interface. Node.js e React. Noções de arquitetura em camadas. Escrever testes unitários, integração e E2E.",
    "Full Stack Júnior",
  );

  expect(
    plan.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
  ).toEqual(expect.arrayContaining(["k7", "k8", "k3", "k2"]));

  expect(plan.priorities.some((p) => p.evidenceIds.includes("z6"))).toBe(true);
});
