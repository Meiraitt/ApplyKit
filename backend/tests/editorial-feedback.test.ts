import { describe, it, expect } from "vitest";
import { validateEditorial } from "../src/domain/cv/cv.js";
import type { Draft } from "../src/domain/types.js";

const draft = (text: string): Draft => ({
  summary: "Desenvolvedor com experiência em aplicações web.",
  skills: [],
  experiences: [
    { sourceId: "beacon", bullets: [{ text, evidenceIds: ["k1"] }] },
  ],
});

describe("actionable editorial feedback", () => {
  it("identifies the exact long bullet without silently truncating it", () => {
    const text = Array(56).fill("palavra").join(" ") + ".";
    const input = draft(text),
      issues = validateEditorial(input, "pt-BR");

    expect(issues.join()).toContain("beacon, bullet 1 (56 words)");
    expect(issues.join()).toContain(text);
    expect(input.experiences[0].bullets[0].text).toBe(text);
  });

  it("rejects duplicated stack footers but permits contextual technologies", () => {
    expect(
      validateEditorial(
        draft(
          "Criou componentes React.\n\nTecnologias utilizadas: React e TypeScript.",
        ),
        "pt-BR",
      ).join(),
    ).toContain("renderer");

    expect(
      validateEditorial(
        draft("Criou componentes reutilizáveis com React e TypeScript."),
        "pt-BR",
      ),
    ).toEqual([]);
  });
});
