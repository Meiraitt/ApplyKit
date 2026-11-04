import { it, expect } from "vitest";
import { loadProfile } from "./fixtures/profile.js";
import {
  requirementSupport,
  groundSelection,
  reconcileMissing,
} from "../src/domain/cv/tailoring.js";

it("accepts React alternatives and preserves conjunctions and qualifiers", async () => {
  const p = await loadProfile();

  expect(
    requirementSupport(p, "Conhecimentos em Vue e/ou React;").supported,
  ).toBe(true);

  expect(requirementSupport(p, "React and/or Vue.").supported).toBe(true);
  expect(requirementSupport(p, "React e Vue").supported).toBe(false);
  expect(requirementSupport(p, "React e/ou Vue e Python").known).toBe(false);
  expect(
    requirementSupport(p, "Experiência avançada em Vue e/ou React").known,
  ).toBe(false);
});

it("does not infer specialized skills from generic frontend or database experience", async () => {
  const p = await loadProfile();

  for (const requirement of [
    "Web Components e React",
    "SEO e otimização de performance (Core Web Vitals)",
    "Noções de arquiteturas de projetos frontend, como MVVM e BLoC",
    "Noções de modelagem de dados e otimização de consultas",
    "Experiência com ferramentas de monitoramento, métricas e observabilidade",
  ])
    expect(requirementSupport(p, requirement).supported).toBe(false);
});

it("records additional and optional technologies without inventing experience", async () => {
  const p = await loadProfile(),
    description =
      "Conhecimentos em Vue e/ou React;\nFamiliaridade com Redis;\nSERIAM PONTOS DE DESTAQUE SE VOCÊ TIVER:\nKubernetes";
  const requirements = [
    "Conhecimentos em Vue e/ou React",
    "Familiaridade com Redis",
    "Kubernetes",
  ].map((requirement) => ({ requirement, evidenceIds: [] }));
  const plan = groundSelection(
    p,
    { requirements, selectedSkills: ["React"], priorities: [] },
    description,
    "Frontend Pleno",
  );
  const gaps = reconcileMissing(p, plan, []);

  expect(gaps.some((g) => g.includes("Vue"))).toBe(false);
  expect(gaps).toContain("Familiaridade com Redis");
  expect(gaps).toContain("Unconfirmed nice-to-have: Kubernetes");
});
