import { describe, it, expect, vi } from "vitest";
import { roleFocus } from "../src/domain/cv/role-focus.js";
import { loadProfile } from "./fixtures/profile.js";
import { groundSelection, focusProfile } from "../src/domain/cv/tailoring.js";
import {
  writeGroundedDraft,
  evidenceSummary,
} from "../src/services/cv/writer.js";
import { repairGroundedDraft } from "../src/services/cv/repair.js";
import { assembleCv, validateEvidence } from "../src/domain/cv/cv.js";
import { reviewerPrompt, summaryWriterPrompt } from "../src/prompts/prompts.js";

describe("Functional role focus", () => {
  it("prioritizes explicit roles and recognizes React and backend labels", () => {
    expect(roleFocus("Desenvolvedor React Pleno (Temporário)")).toBe(
      "frontend",
    );

    expect(roleFocus("Back-end Developer Júnior")).toBe("backend");
    expect(roleFocus("Frontend Pleno", "Equipe full stack com Node.js")).toBe(
      "frontend",
    );

    expect(roleFocus("Full Stack React/Node")).toBe("fullstack");
    expect(roleFocus("Software Engineer", "Vaga de backend com Node.js")).toBe(
      "backend",
    );
  });

  it("generates backend-focused CVs without invented MySQL or authorship", async () => {
    const profile = await loadProfile(),
      job = {
        title: "Back-end Developer Júnior",
        company: "Teste",
        language: "pt-BR" as const,
        description: "TypeScript, Node.js, PostgreSQL e APIs. Testes.",
      };
    const plan = groundSelection(
      profile,
      {
        requirements: [],
        selectedSkills: [
          "React",
          "Next.js",
          "TypeScript",
          "Node.js",
          "PostgreSQL",
        ],
        priorities: [
          { sourceId: "atlas", evidenceIds: ["l1", "l2", "l3", "l4"] },
          { sourceId: "beacon", evidenceIds: ["k2", "k7", "k8", "k10"] },
        ],
      },
      job.description,
      job.title,
    );

    expect(
      plan.priorities
        .find((p) => p.sourceId === "atlas")!
        .evidenceIds.slice(0, 2),
    ).toEqual(["l3", "l4"]);

    expect(plan.selectedSkills).toContain("NestJS");
    const infer = vi.fn(async (_model: string, prompt: string, schema: any) => {
      if (schema.shape.summary)
        return {
          summary:
            "Desenvolvedor Backend com experiência em Node.js, integrações REST e GraphQL e gerenciamento de permissões.",
          summaryEvidenceIds: ["k2", "l3"],
          skills: ["Node.js", "NestJS"],
        };
      const id = JSON.parse(
          prompt
            .split("<TARGET_EXPERIENCE>")[1]
            .split("</TARGET_EXPERIENCE>")[0],
        ).id,
        source = profile.experiences.find((e) => e.id === id)!;

      return {
        bullets: plan.priorities
          .find((p) => p.sourceId === id)!
          .evidenceIds.map((id) => {
            const f = source.facts.find((f) => f.id === id)!;

            return { text: f.cvText ?? f.text, evidenceIds: [id] };
          }),
      };
    });
    const draft = await writeGroundedDraft(
      infer as any,
      "mock",
      focusProfile(profile, plan, job.description),
      job,
      undefined,
      undefined,
      plan,
    );
    const cv = assembleCv(
      draft,
      profile,
      job.language,
      job.title,
      job.description,
    );

    expect(cv.headline).toContain("Desenvolvedor Backend");
    expect(cv.headline).not.toContain("React");
    expect(cv.summary).toContain("Desenvolvedor Backend");
    expect(cv.summary).not.toMatch(/renderização|cache|UI\/UX|MySQL/);
    expect(cv.summary).toContain("REST e GraphQL");
    expect(cv.summary).not.toContain("restauração do estado");
    expect(infer).toHaveBeenCalled();
    expect(validateEvidence(draft, profile)).toEqual([]);
    expect(cv.experiences[0].bullets[0]).toContain("Trabalhou");
  });

  it("preserves testing when replacing redundant endpoints with end-to-end delivery", async () => {
    const profile = await loadProfile();
    const plan = groundSelection(
      profile,
      {
        requirements: [],
        selectedSkills: ["React", "Node.js"],
        priorities: [],
      },
      "React, Node.js, arquitetura, integração e testes.",
      "Desenvolvedor Full Stack",
    );

    expect(
      plan.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
    ).toEqual(expect.arrayContaining(["k2", "k8", "k10"]));
  });

  it("writer and reviewer receive editorial guidance independent of fidelity", async () => {
    const profile = await loadProfile(),
      job = {
        title: "Backend Developer",
        language: "pt-BR",
        description: "Node.js",
      };

    expect(summaryWriterPrompt(job, [])).toContain("Role focus: backend");
    expect(
      reviewerPrompt(profile, job, {
        summary: "Resumo",
        skills: [],
        experiences: [],
      }),
    ).toContain("Assess summary relevance independently");
  });

  it("requests the summary without editing out-of-scope bullets", async () => {
    const profile = await loadProfile(),
      job = {
        title: "Backend Developer",
        company: "Teste",
        language: "pt-BR",
        description: "Node.js e APIs",
      };
    const ids = ["l3", "l4", "k2", "k8"];
    const experiences = profile.experiences.flatMap((e) => {
      const bullets = e.facts
        .filter((f) => ids.includes(f.id))
        .map((f) => ({ text: f.cvText!, evidenceIds: [f.id] }));

      return bullets.length ? [{ sourceId: e.id, bullets }] : [];
    });
    const previous = {
      summary: "Desenvolvedor frontend com React e experiência em interfaces.",
      summaryEvidenceIds: ["l1"],
      skills: ["React", "Node.js"],
      experiences,
    };
    const expected = evidenceSummary(profile, job, ids, true)!;
    const infer = vi.fn().mockResolvedValue({
      summary: {
        text: expected.summary,
        evidenceIds: expected.summaryEvidenceIds,
      },
      skills: null,
      edits: [],
      orders: [],
    });
    const fixed = await repairGroundedDraft(
      infer as any,
      "mock",
      profile,
      job,
      {
        approved: false,
        issues: [
          {
            severity: "blocking",
            section: "Resumo",
            problem: "Foco frontend em vaga backend",
            fix: expected.summary,
          },
        ],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      },
      previous,
    );

    expect(fixed.summary).toBe(expected.summary);
    expect(validateEvidence(fixed, profile)).toEqual([]);
    expect(fixed.experiences).toEqual(previous.experiences);
    expect(infer).toHaveBeenCalledTimes(1);
  });

  it("substitutes skills only with confirmed names", async () => {
    const profile = await loadProfile(),
      source = profile.experiences.find((e) => e.id === "atlas")!;
    const previous = {
        summary: "Desenvolvedor com experiência em aplicações web.",
        summaryEvidenceIds: ["l3"],
        skills: ["Next.js", "Node.js"],
        experiences: [
          {
            sourceId: source.id,
            bullets: [
              {
                text: source.facts.find((f) => f.id === "l3")!.cvText!,
                evidenceIds: ["l3"],
              },
            ],
          },
        ],
      },
      infer = vi.fn().mockResolvedValue({
        summary: null,
        skills: ["NestJS", "Node.js"],
        edits: [],
        orders: [],
      });
    const fixed = await repairGroundedDraft(
      infer as any,
      "mock",
      profile,
      { title: "Backend", language: "pt-BR", description: "Node.js" },
      {
        approved: false,
        issues: [
          {
            severity: "blocking",
            section: "Habilidades",
            problem: "Framework backend omitido",
            fix: "Substitua somente Next.js por NestJS.",
          },
        ],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      },
      previous,
    );

    expect(fixed.skills).toEqual(["NestJS", "Node.js"]);
    expect(fixed.summary).toBe(previous.summary);
    expect(infer).toHaveBeenCalledTimes(1);
  });
});
