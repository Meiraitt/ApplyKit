import { describe, it, expect, vi } from "vitest";
import { repairGroundedDraft } from "../src/services/cv/repair.js";
import { loadProfile } from "./fixtures/profile.js";
import type { Draft, Review } from "../src/domain/types.js";

const previous: Draft = {
  summary: "Desenvolvedor de aplicações com React e Node.js.",
  summaryEvidenceIds: ["k1", "k2"],
  skills: ["React", "Node.js"],
  experiences: [
    {
      sourceId: "beacon",
      bullets: [
        { text: "Desenvolveu aplicações com React.", evidenceIds: ["k1"] },
        { text: "Colaborou no backend Node.js.", evidenceIds: ["k2"] },
      ],
    },
  ],
};
const review: Review = {
  approved: false,
  issues: [
    {
      severity: "blocking",
      section: "Beacon",
      problem: "Especificar a integração",
      fix: "No segundo tópico, preservar REST e GraphQL de k2.",
    },
  ],
  strengths: [],
  questionsForCandidate: [],
  missingRequirements: [],
};

describe("Correction patch", () => {
  it("sends requested corrections even when feedback includes reference prose", async () => {
    const profile = await loadProfile(),
      text = profile.experiences
        .find((e) => e.id === "beacon")!
        .facts.find((f) => f.id === "k2")!.cvText!;
    const infer = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [
        { sourceId: "beacon", bulletIndex: 0, text, evidenceIds: ["k2"] },
      ],
      orders: [],
    });
    const feedback = {
      ...review,
      issues: [
        {
          severity: "blocking" as const,
          section: "beacon",
          problem: "O tópico k1 não representa a responsabilidade central.",
          fix: `Substitua k1 por k2: ${text}`,
        },
      ],
    };
    const result = await repairGroundedDraft(
      infer as any,
      "mock",
      profile,
      { language: "pt-BR" },
      feedback,
      previous,
    );

    expect(infer).toHaveBeenCalledTimes(1);
    expect(result.experiences[0].bullets[0]).toEqual({
      text,
      evidenceIds: ["k2"],
    });

    expect(result.summary).toBe(previous.summary);
  });

  it("preserves unedited fields literally and does not mutate the original draft", async () => {
    const saved = structuredClone(previous);
    const infer = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [
        {
          sourceId: "beacon",
          bulletIndex: 1,
          text: "Colaborou em implementações Node.js com integrações REST e GraphQL.",
          evidenceIds: ["k2"],
        },
      ],
    });
    const result = await repairGroundedDraft(
      infer as any,
      "mock",
      await loadProfile(),
      {},
      review,
      previous,
    );

    expect(result.summary).toBe(previous.summary);
    expect(result.skills).toEqual(previous.skills);
    expect(result.experiences[0].bullets[0]).toEqual(
      previous.experiences[0].bullets[0],
    );

    expect(previous).toEqual(saved);
  });

  it("rejects another company's evidence even if its ID exists in the profile", async () => {
    const infer = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [
        {
          sourceId: "beacon",
          bulletIndex: 0,
          text: "Implementou um endpoint administrativo.",
          evidenceIds: ["l3"],
        },
      ],
    });

    await expect(
      repairGroundedDraft(
        infer as any,
        "mock",
        await loadProfile(),
        {},
        review,
        previous,
      ),
    ).rejects.toThrow();
  });

  it("reorders without changing content and rejects duplicate indices", async () => {
    const orderReview = {
      ...review,
      issues: [
        {
          severity: "blocking" as const,
          section: "Beacon",
          problem: "Ordem dos tópicos",
          fix: "Reordene como [1,0] e preserve os textos.",
        },
      ],
    };
    const infer = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [],
      orders: [{ sourceId: "beacon", bulletOrder: [1, 0] }],
    });
    const result = await repairGroundedDraft(
      infer as any,
      "mock",
      await loadProfile(),
      {},
      orderReview,
      previous,
    );

    expect(result.experiences[0].bullets).toEqual(
      [...previous.experiences[0].bullets].reverse(),
    );

    infer.mockResolvedValue({
      summary: null,
      skills: null,
      edits: [],
      orders: [{ sourceId: "beacon", bulletOrder: [0, 0] }],
    });

    await expect(
      repairGroundedDraft(
        infer as any,
        "mock",
        await loadProfile(),
        {},
        orderReview,
        previous,
      ),
    ).rejects.toThrow("invalid bullet order");
  });

  it("prevents experience edits when feedback targets only the summary", async () => {
    const infer = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [
        {
          sourceId: "beacon",
          bulletIndex: 0,
          text: "Outra redação não solicitada para a experiência.",
          evidenceIds: ["k1"],
        },
      ],
      orders: [],
    });
    const feedback = {
      ...review,
      issues: [
        {
          severity: "blocking" as const,
          section: "Resumo",
          problem: "Resumo genérico",
          fix: "Sintetize as entregas confirmadas de k1 e k2.",
        },
      ],
    };

    await expect(
      repairGroundedDraft(
        infer as any,
        "mock",
        await loadProfile(),
        {},
        feedback,
        previous,
      ),
    ).rejects.toThrow();
  });
});
