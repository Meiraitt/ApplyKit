import { describe, it, expect } from "vitest";
import { relationalIssues } from "../src/domain/cv/evidence-policy.js";
import {
  buildRequest,
  readOllamaStream,
} from "../src/infrastructure/providers/ollama-client.js";

const facts = (...text: string[]) => text.map((text) => ({ text }));

describe("Qwen 3.5 factual regressions", () => {
  it("does not turn Core Web Vitals measurement into results or incident causes", () => {
    const source = facts(
      "Investigou e corrigiu requisições repetidas em useEffect.",
      "Avaliou LCP, INP e CLS usando Lighthouse.",
    );

    expect(
      relationalIssues(
        "Corrigiu requisições repetidas que afetaram LCP e CLS.",
        source,
      ),
    ).not.toEqual([]);

    expect(
      relationalIssues(
        "Avaliou performance com Lighthouse, otimizando LCP, INP e CLS.",
        source,
      ),
    ).not.toEqual([]);

    expect(
      relationalIssues(
        "Corrigiu requisições repetidas. Avaliou LCP, INP e CLS usando Lighthouse.",
        source,
      ),
    ).toEqual([]);

    expect(
      relationalIssues(
        "Melhorou LCP com otimizações de renderização.",
        facts("Melhorou LCP com otimizações de renderização."),
      ),
    ).toEqual([]);
  });

  it("does not transfer GraphQL between integrations", () => {
    const source = facts(
      "Implementou endpoints da bridge para consultar saldos via APIs externas.",
      "Integrou funcionalidades frontend e backend com REST e GraphQL.",
    );

    expect(
      relationalIssues("Implementou endpoints da bridge com GraphQL.", source),
    ).not.toEqual([]);

    expect(
      relationalIssues(
        "Implementou endpoints da bridge para consultar saldos. Integrou outras funcionalidades com REST e GraphQL.",
        source,
      ),
    ).toEqual([]);

    expect(
      relationalIssues(
        "Implementou endpoints da bridge com GraphQL.",
        facts("Implementou endpoints da bridge com GraphQL."),
      ),
    ).toEqual([]);
  });

  it("negative restrictions do not prove claims or complete authorship", () => {
    const source = facts(
      "Participou da implementação da integração Privy. Não foram confirmados OAuth2 nem idempotência.",
    );

    expect(
      relationalIssues("Implementou a integração Privy com OAuth2.", source)
        .length,
    ).toBe(2);

    expect(
      relationalIssues(
        "Participou da implementação da integração Privy.",
        source,
      ),
    ).toEqual([]);
  });

  it("rejects invented guarantees and accepts confirmed outcomes", () => {
    expect(
      relationalIssues(
        "Refatorou componentes garantindo estabilidade.",
        facts("Refatorou componentes."),
      ),
    ).not.toEqual([]);

    expect(
      relationalIssues(
        "Refatorou componentes garantindo estabilidade.",
        facts("Refatorou componentes garantindo estabilidade."),
      ),
    ).toEqual([]);
  });
});

describe("Transporte Ollama", () => {
  it("controls Qwen thinking explicitly and shares app and benchmark requests", () => {
    expect(buildRequest("qwen3.5:9b-q4_K_M", "CV_TEXT", {})).toMatchObject({
      stream: true,
      think: false,
      options: { temperature: 0.1, num_ctx: 16384 },
    });

    expect(buildRequest("qwen2.5:7b-instruct", "", {})).not.toHaveProperty(
      "think",
    );
  });

  it("reassembles UTF-8 chunks and preserves metadata while rejecting truncation", async () => {
    const enc = new TextEncoder(),
      raw = enc.encode(
        JSON.stringify({ message: { content: "ação" } }) +
          "\n" +
          JSON.stringify({ done: true, done_reason: "stop", eval_count: 2 }) +
          "\n",
      );
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < raw.length; i++) c.enqueue(raw.slice(i, i + 1));
        c.close();
      },
    });

    expect(await readOllamaStream(new Response(stream))).toMatchObject({
      message: { content: "ação" },
      eval_count: 2,
    });

    await expect(
      readOllamaStream(new Response('{"message":{"content":"{}"}}\n')),
    ).rejects.toThrow("before completing");

    await expect(
      readOllamaStream(new Response('{"done":true,"done_reason":"length"}\n')),
    ).rejects.toThrow("output limit");

    await expect(
      readOllamaStream(new Response('{"error":"out of memory"}\n')),
    ).rejects.toThrow("out of memory");
  });
});

import { vi } from "vitest";
import {
  writePlannedExperience,
  bulletWritingIssues,
} from "../src/services/cv/planned-writer.js";
import type { Profile } from "../src/domain/types.js";

it("separates planning from writing and returns factual failures to the model", async () => {
  const source = {
    id: "job",
    company: "Empresa",
    role: "Developer",
    period: "2025",
    kind: "work" as const,
    facts: [
      {
        id: "a1",
        text: "Trabalhou em um endpoint Node.js para salvar drafts.",
        area: "backend" as const,
      },
      {
        id: "a2",
        text: "Escreveu testes de componentes React.",
        area: "quality" as const,
      },
    ],
  };
  const profile: Profile = {
    name: "Teste",
    headline: "Dev",
    summary: "",
    contact: {},
    education: [],
    languages: [],
    skills: ["Node.js", "React"],
    experiences: [source],
  };
  const infer = vi
    .fn()
    .mockResolvedValueOnce({
      outline: [
        {
          purpose: "Demonstrar participação no endpoint de drafts.",
          evidenceIds: ["a1"],
        },
        { purpose: "Demonstrar testes de componentes.", evidenceIds: ["a2"] },
      ],
    })
    .mockResolvedValueOnce({
      text: "Implementou um endpoint Node.js para salvar drafts.",
      evidenceIds: ["a1"],
    })
    .mockResolvedValueOnce({
      text: "Trabalhou em um endpoint Node.js para salvar drafts.",
      evidenceIds: ["a1"],
    })
    .mockResolvedValueOnce({
      text: "Escreveu testes de componentes React.",
      evidenceIds: ["a2"],
    });
  const result = await writePlannedExperience(
    infer as any,
    "qwen3.5",
    source,
    profile,
    { language: "pt-BR" },
    "Contexto da vaga.",
  );

  expect(result).toHaveLength(2);
  expect(result[0].text).toMatch(/^Trabalhou/);
  expect(infer.mock.calls[2][1]).toContain("Inflated endpoint authorship");
  expect(infer.mock.calls[1][1]).not.toContain("a2");
  expect(bulletWritingIssues("Entregou interfaces com")).not.toEqual([]);
  expect(bulletWritingIssues("Desenvolveu componentes React.")).toEqual([]);
});

import { validateEvidence } from "../src/domain/cv/cv.js";

it("accepts singular and plural personal-project context in summaries", () => {
  const profile: Profile = {
    name: "Teste",
    headline: "Dev",
    summary: "",
    contact: {},
    education: [],
    languages: [],
    skills: [],
    experiences: [
      {
        id: "p",
        company: "Projeto",
        role: "Projeto",
        period: "",
        kind: "project",
        facts: [
          { id: "p1", text: "Implementou microserviços em projeto pessoal." },
        ],
      },
    ],
  };

  for (const context of ["projeto pessoal", "projetos pessoais"])
    expect(
      validateEvidence(
        {
          summary:
            "Desenvolvedor com prática de microserviços em " + context + ".",
          summaryEvidenceIds: ["p1"],
          skills: [],
          experiences: [],
        },
        profile,
      ),
    ).toEqual([]);
  expect(
    validateEvidence(
      {
        summary: "Desenvolvedor com experiência profissional em microserviços.",
        summaryEvidenceIds: ["p1"],
        skills: [],
        experiences: [],
      },
      profile,
    ).some((i) => i.includes("personal project")),
  ).toBe(true);
});

it("does not transfer endpoint authorship when summarizing", () => {
  const source = facts(
    "Trabalhou em um endpoint administrativo no backend Node.js e NestJS.",
    "Implementou um endpoint de leaderboard em Node.js.",
  );

  expect(
    relationalIssues(
      "Implementou melhorias de UI/UX, endpoints administrativos e leaderboard.",
      source,
    ).some((i) => i.includes("Inflated endpoint authorship")),
  ).toBe(true);

  expect(
    relationalIssues(
      "Desenvolvedor implementando endpoints administrativos no backend.",
      source,
    ).some((i) => i.includes("Inflated endpoint authorship")),
  ).toBe(true);

  expect(
    relationalIssues(
      "Implementou um endpoint de leaderboard. Trabalhou em um endpoint administrativo.",
      source,
    ),
  ).toEqual([]);

  expect(
    relationalIssues(
      "Implementou interfaces e trabalhou em um endpoint administrativo.",
      source,
    ),
  ).toEqual([]);
});

it("does not infer test types from tools", () => {
  expect(
    relationalIssues(
      "Desenvolveu testes de ponta a ponta com Cypress e Jest.",
      facts("Atuou em QA manual e utilizou Cypress e Jest para testes."),
    ),
  ).not.toEqual([]);

  expect(
    relationalIssues(
      "Escreveu testes de ponta a ponta.",
      facts(
        "Escreveu testes de funções, integração e ponta a ponta com mocks.",
      ),
    ),
  ).toEqual([]);
});
