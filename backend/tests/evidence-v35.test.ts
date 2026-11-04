import { it, expect } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import { groundSelection } from "../src/domain/cv/tailoring.js";

it("preserves frontend performance and collaboration without confusing schemas and tickets", async () => {
  const profile = await loadProfile(),
    description =
      "Entregar features na interface de ponta a ponta. React, TypeScript, APIs REST e GraphQL. Design System, estado e testes. Performance em produção, code review.\nDiferenciais\nValidação de dados com schemas Zod.";
  const requirements = [
    "React",
    "TypeScript",
    "APIs REST",
    "GraphQL",
    "Design System",
    "testes",
    "Performance",
    "code review",
    "Validação de dados com schemas Zod",
  ].map((requirement) => ({ requirement, evidenceIds: [] }));
  const plan = groundSelection(
    profile,
    {
      requirements,
      selectedSkills: ["React"],
      priorities: [
        { sourceId: "beacon", evidenceIds: ["k10", "k2", "k3", "k5"] },
        { sourceId: "cedar-dev", evidenceIds: ["z1", "z2", "z7", "z3"] },
      ],
    },
    description,
    "Engineering | Frontend Engineer",
  );
  const beacon = plan.priorities.find(
      (p) => p.sourceId === "beacon",
    )!.evidenceIds,
    cedar = plan.priorities.find(
      (p) => p.sourceId === "cedar-dev",
    )!.evidenceIds;

  expect(beacon).toEqual(expect.arrayContaining(["k3", "k4", "k10"]));
  expect(cedar).not.toContain("z7");

  for (const p of plan.priorities) {
    expect(new Set(p.evidenceIds).size).toBe(p.evidenceIds.length);
    expect(p.evidenceIds.length).toBeLessThanOrEqual(4);
  }
});

import { enforceFrontendCoverage } from "../src/services/cv/reviewer.js";

it("flags omitted performance even when the model approves redundant integration", async () => {
  const profile = await loadProfile(),
    ids = { atlas: ["l4"], beacon: ["k10", "k2", "k3", "k5"] };
  const draft = {
    summary: "Resumo",
    skills: [],
    experiences: Object.entries(ids).map(([sourceId, ids]) => ({
      sourceId,
      bullets: ids.map((id) => {
        const f = profile.experiences
          .find((e) => e.id === sourceId)!
          .facts.find((f) => f.id === id)!;

        return { text: f.cvText ?? f.text, evidenceIds: [id] };
      }),
    })),
  };
  const audit = draft.experiences.flatMap((e) =>
    e.bullets.map((_, bulletIndex) => ({
      sourceId: e.sourceId,
      bulletIndex,
      decision: "keep" as const,
      reason: "Entrega confirmada.",
      replacementEvidenceIds: [],
    })),
  );
  const result = enforceFrontendCoverage(
    profile,
    {
      title: "Frontend Engineer",
      description: "Performance e qualidade em produção",
    },
    draft,
    audit,
  );

  expect(
    result.find((a) => a.sourceId === "beacon" && a.bulletIndex === 1)
      ?.replacementEvidenceIds,
  ).toEqual(["k4"]);

  expect(
    enforceFrontendCoverage(
      profile,
      { title: "Backend", description: "Performance" },
      draft,
      audit,
    ),
  ).toEqual(audit);

  expect(
    enforceFrontendCoverage(
      profile,
      {
        title: "Frontend",
        description: "Interfaces. Diferenciais: performance",
      },
      draft,
      audit,
    ),
  ).toEqual(audit);
});
