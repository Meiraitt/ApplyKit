import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { profileSchema } from "../src/domain/types.js";
import {
  evidenceCases,
  codexWriterPrompt,
} from "../src/prompts/codex-prompts.js";
import { validateEvidence } from "../src/domain/cv/cv.js";

it("retains confirmed release leadership without requiring permanent people management", () => {
  const p = profileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/profile-review.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const source = p.experiences.find((e) =>
    e.facts.some((f) => f.id === "k25"),
  )!;
  const text =
    "Coordenei a entrega do calendário de oficinas de leitura, organizando a validação com bibliotecários e comunicando a ordem de liberação das funcionalidades.";

  expect(
    validateEvidence(
      {
        summary: "Desenvolvedor de aplicações web.",
        skills: [],
        experiences: [
          { sourceId: source.id, bullets: [{ text, evidenceIds: ["k25"] }] },
        ],
      },
      p,
    ),
  ).toEqual([]);

  expect(
    evidenceCases(p).find((c) => c.id === "release-ownership")?.evidenceIds,
  ).toEqual(["k25"]);

  const without = {
    ...p,
    experiences: p.experiences.map((e) => ({
      ...e,
      facts: e.facts.filter((f) => f.id !== "k25"),
    })),
  };

  expect(evidenceCases(without).some((c) => c.id === "release-ownership")).toBe(
    false,
  );

  expect(
    codexWriterPrompt(p, {
      title: "Frontend",
      description: "React e colaboração com cliente",
      language: "pt-BR",
    }),
  ).toContain("Leading one delivery does not imply people management");
});
