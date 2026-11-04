import { describe, it, expect, vi } from "vitest";
import { reviewGroundedDraft } from "../src/services/cv/reviewer.js";
import { loadProfile } from "./fixtures/profile.js";
import type { Draft } from "../src/domain/types.js";

const draft: Draft = {
  summary: "Software developer with experience in React and TypeScript.",
  summaryEvidenceIds: ["k1"],
  skills: ["React"],
  experiences: [
    {
      sourceId: "beacon",
      bullets: [
        {
          text: "Migrated state management from Context API to Zustand, enhancing reusability and architecture.",
          evidenceIds: ["k3"],
        },
      ],
    },
  ],
};

describe("Factual review separate from editing", () => {
  it("blocks factual extrapolation despite overall approval", async () => {
    const infer = vi
      .fn()
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({
        issues: [
          {
            quote: "enhancing reusability and architecture",
            problem: "A migração não comprova essa causalidade.",
            fix: "Descreva as ações separadamente, sem atribuir resultado à migração.",
          },
        ],
      })
      .mockResolvedValueOnce({
        approved: true,
        issues: [],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      })
      .mockResolvedValueOnce({
        bullets: {
          "0": {
            decision: "keep",
            reason:
              "Demonstra gerenciamento de estado relevante para frontend.",
            replacementEvidenceIds: [],
          },
        },
      });
    const result = await reviewGroundedDraft(
      infer as any,
      "mock",
      await loadProfile(),
      { title: "Frontend", language: "en" },
      draft,
    );

    expect(result.approved).toBe(false);
    expect(result.issues[0].section).toBe("beacon");
    expect(result.issues[0].problem).toContain("enhancing reusability");
    const evidence = JSON.parse(
      infer.mock.calls[1][1]
        .split("<CONFIRMED_FACTS>")[1]
        .split("</CONFIRMED_FACTS>")[0],
    );

    expect(evidence.map((f: any) => f.id)).toEqual(["k3"]);
    expect(evidence[0].text).toContain("painel de acervo");
  });

  it("rejects stale indices and prevents substitution of the criticized source", async () => {
    const infer = vi.fn().mockResolvedValue({
      issues: [
        {
          claimIndex: 9,
          problem: "Crítica sem correspondência.",
          fix: "Corrigir.",
        },
      ],
    });

    await expect(
      reviewGroundedDraft(infer as any, "mock", await loadProfile(), {}, draft),
    ).rejects.toThrow();

    infer.mockResolvedValue({
      issues: [
        {
          claimIndex: 0,
          problem: "Referência de outra experiência.",
          fix: "Corrigir.",
          evidenceIds: ["l1"],
        },
      ],
    });

    await expect(
      reviewGroundedDraft(infer as any, "mock", await loadProfile(), {}, draft),
    ).rejects.toThrow();
  });

  it("retries reviews that quote evidence instead of CV text", async () => {
    const infer = vi
      .fn()
      .mockResolvedValueOnce({
        issues: [
          {
            quote: "Participou de code reviews",
            problem: "Trecho que não existe no resumo.",
            fix: "Alterar o resumo sem fundamento.",
          },
        ],
      })
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({
        approved: true,
        issues: [],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      })
      .mockResolvedValueOnce({
        bullets: {
          "0": {
            decision: "keep",
            reason:
              "Demonstra gerenciamento de estado relevante para frontend.",
            replacementEvidenceIds: [],
          },
        },
      });
    const result = await reviewGroundedDraft(
      infer as any,
      "mock",
      await loadProfile(),
      {},
      draft,
    );

    expect(infer.mock.calls[1][1]).toContain("INVALID_RESPONSE");
    expect(result.approved).toBe(true);
  });

  it("does not approve persistent invalid criticism or identical corrections", async () => {
    const infer = vi.fn().mockResolvedValue({
      issues: [
        {
          quote: "Software developer",
          problem: "Crítica sem diferença factual demonstrada.",
          fix: draft.summary,
        },
      ],
    });

    await expect(
      reviewGroundedDraft(infer as any, "mock", await loadProfile(), {}, draft),
    ).rejects.toThrow("No approval");

    expect(infer).toHaveBeenCalledTimes(2);
  });

  it("does not invent accomplishments in review strengths", async () => {
    const infer = vi
      .fn()
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({
        approved: true,
        issues: [],
        strengths: ["Liderou arquitetura backend e aquisição de usuários."],
        missingRequirements: [],
        questionsForCandidate: [],
      })
      .mockResolvedValueOnce({
        bullets: {
          "0": {
            decision: "keep",
            reason:
              "Demonstra gerenciamento de estado relevante para frontend.",
            replacementEvidenceIds: [],
          },
        },
      });
    const result = await reviewGroundedDraft(
      infer as any,
      "mock",
      await loadProfile(),
      {},
      draft,
    );

    expect(result.strengths).toEqual([draft.experiences[0].bullets[0].text]);
    expect(result.strengths.join(" ")).not.toContain("Liderou");
  });
});

it("rejects a correction identical to only the quoted fragment", async () => {
  const infer = vi.fn().mockResolvedValue({
    issues: [
      {
        quote: "Software developer",
        problem: "Crítica contraditória sem mudança.",
        fix: "Software developer",
      },
    ],
  });

  await expect(
    reviewGroundedDraft(infer as any, "mock", await loadProfile(), {}, draft),
  ).rejects.toThrow("No approval");

  expect(infer).toHaveBeenCalledTimes(2);
});

it("rechecks substitutions against candidate facts rather than contradictory reasons", async () => {
  const { auditBullets } = await import("../src/services/cv/reviewer.js");
  const infer = vi
    .fn()
    .mockResolvedValueOnce({
      bullets: {
        "0": {
          decision: "replace",
          reason: "Trocar por k5, mas a referência proposta aponta k7.",
          replacementEvidenceIds: ["k7"],
        },
      },
    })
    .mockResolvedValueOnce({
      decision: "keep",
      reason:
        "O endpoint de leaderboard não acrescenta cobertura central à vaga frontend.",
    });
  const result = await auditBullets(
    infer as any,
    "mock",
    await loadProfile(),
    {
      title: "Frontend",
      description: "Componentes e gerenciamento de estado.",
    },
    draft,
  );

  expect(result[0].decision).toBe("keep");
  expect(result[0].replacementEvidenceIds).toEqual([]);
  expect(infer.mock.calls[1][1]).toContain("VERIFY_REPLACEMENT");
  expect(infer.mock.calls[1][1]).toContain("leaderboard");
  expect(infer.mock.calls[1][1]).not.toContain("Trocar por k5");
});

it("entrega ao escritor o ID da experiência quando o revisor devolve o nome da empresa", async () => {
  const infer = vi
    .fn()
    .mockResolvedValueOnce({ issues: [] })
    .mockResolvedValueOnce({ issues: [] })
    .mockResolvedValueOnce({
      approved: false,
      issues: [
        {
          severity: "blocking",
          section: "Experiências - Beacon Labs",
          problem: "Dar mais espaço à colaboração confirmada.",
          fix: "Incluir a evidência k5.",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    })
    .mockResolvedValueOnce({
      bullets: {
        "0": {
          decision: "keep",
          reason: "Entrega relevante para a vaga.",
          replacementEvidenceIds: [],
        },
      },
    });
  const result = await reviewGroundedDraft(
    infer as any,
    "mock",
    await loadProfile(),
    {},
    draft,
  );

  expect(result.issues[0].section).toBe("beacon");
  expect(result.approved).toBe(false);
});
