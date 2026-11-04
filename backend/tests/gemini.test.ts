import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  createGeminiClient,
  parseGeminiResponse,
  geminiWireSchema,
} from "../src/infrastructure/providers/gemini-client.js";
import {
  runGeminiCv,
  geminiWriterPrompt,
  geminiLocalIssues,
} from "../src/services/cv/gemini-flow.js";
import { profileSchema, type Review } from "../src/domain/types.js";

const profile = profileSchema.parse({
  name: "Teste",
  headline: "Developer",
  contact: {},
  summary: "",
  skills: ["React"],
  education: [],
  languages: [],
  experiences: [
    {
      id: "company",
      company: "Empresa",
      role: "Developer",
      period: "2025–2026",
      kind: "work",
      facts: [
        {
          id: "f1",
          text: "Desenvolveu interfaces React e componentes reutilizáveis.",
          area: "frontend",
        },
      ],
    },
  ],
});
const job = {
  title: "Frontend Developer",
  description: "Desenvolver interfaces React e componentes reutilizáveis.",
  language: "pt-BR" as const,
};
const output = () => ({
  requirements: [],
  selectionReasons: [
    { sourceId: "company", rationale: "Interfaces comprovadas" },
  ],
  draft: {
    summary:
      "Desenvolvedor com experiência em React, interfaces web e componentes reutilizáveis.",
    summaryEvidenceIds: ["f1"],
    skills: ["React"],
    experiences: [
      {
        sourceId: "company",
        bullets: [
          {
            text: "Desenvolvi interfaces React e componentes reutilizáveis.",
            evidenceIds: ["f1"],
          },
        ],
      },
    ],
  },
});
const approved = (): Review => ({
  approved: true,
  issues: [],
  strengths: [],
  missingRequirements: [],
  questionsForCandidate: [],
});
const rejected = (): Review => ({
  ...approved(),
  approved: false,
  issues: [
    {
      severity: "blocking",
      section: "Resumo",
      problem: "Revisar posicionamento.",
      fix: "Destaque interfaces sem inventar resultados.",
    },
  ],
});
const envelope = (data: unknown) => ({
  candidates: [
    {
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(data) }] },
    },
  ],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
});

describe("Gemini bounded flow", () => {
  it("generates and reviews in two calls using full facts and without canned CV prose", async () => {
    const calls: any[] = [];
    const infer: any = async (role: string, prompt: string) => {
      calls.push({ role, prompt });

      return role === "writer" ? output() : approved();
    };
    const r = await runGeminiCv(infer, profile, job);

    expect(r.review.approved).toBe(true);
    expect(r.calls).toBe(2);
    expect(calls.map((c) => c.role)).toEqual(["writer", "reviewer"]);
    expect(calls[1].prompt).toContain(profile.experiences[0].facts[0].text);
    expect(
      geminiWriterPrompt(
        {
          ...profile,
          experiences: [
            {
              ...profile.experiences[0],
              facts: [
                {
                  ...profile.experiences[0].facts[0],
                  cvText: "DO NOT COPY TEMPLATE",
                },
              ],
            },
          ],
        },
        job,
      ),
    ).not.toContain("DO NOT COPY TEMPLATE");
  });

  it("feeds reviewer feedback and previous draft to one correction, then reviews again", async () => {
    let reviews = 0;
    const writers: string[] = [];
    const infer: any = async (role: string, prompt: string) => {
      if (role === "writer") {
        writers.push(prompt);

        return output();
      }

      return ++reviews === 1 ? rejected() : approved();
    };
    const r = await runGeminiCv(infer, profile, job);

    expect(r.calls).toBe(4);
    expect(r.review.approved).toBe(true);
    expect(writers[1]).toContain("Revisar posicionamento.");
    expect(writers[1]).toContain(output().draft.summary);
  });

  it("stops at six calls with unresolved content still rejected", async () => {
    const infer: any = vi.fn(async (role: string) =>
      role === "writer" ? output() : rejected(),
    );
    const r = await runGeminiCv(infer, profile, job);

    expect(infer).toHaveBeenCalledTimes(6);
    expect(r.review.approved).toBe(false);
  });

  it("local evidence checks override a false model approval and survive all attempts", async () => {
    const bad = output();

    bad.draft.experiences[0].bullets[0].text =
      "Desenvolveu interfaces React e aumentou a conversão em 35%.";

    const r = await runGeminiCv(
      async (role) => (role === "writer" ? structuredClone(bad) : approved()),
      profile,
      job,
    );

    expect(r.review.approved).toBe(false);
    expect(r.calls).toBe(6);
    expect(r.review.issues.some((i) => i.problem.includes("35"))).toBe(true);
  });

  it("blocks missing recent work and preserves a checkpoint when the reviewer fails", async () => {
    expect(
      geminiLocalIssues(
        { ...output().draft, experiences: [] },
        profile,
        job,
      ).some((i) => i.includes("omitted")),
    ).toBe(true);

    const checkpoints: any[] = [];

    await expect(
      runGeminiCv(
        async (role) => {
          if (role === "reviewer") throw Error("quota");

          return output();
        },
        profile,
        job,
        {
          onCheckpoint: (c) => {
            checkpoints.push(c);
          },
        },
      ),
    ).rejects.toThrow("quota");

    expect(checkpoints.at(-1).draft).toEqual(output().draft);
  });
});

describe("Gemini API transport", () => {
  it("routes keys by role, uses stateless structured output and counts requests", async () => {
    const requests: any[] = [];
    const fetcher: any = async (url: string, init: any) => {
      requests.push({ url, ...init });

      return new Response(JSON.stringify(envelope({ ok: true })));
    };
    const metrics: any[] = [];
    const client = createGeminiClient({
      model: "gemini-3.8-flash",
      writerKey: "writer-secret",
      reviewerKey: "review-secret",
      minIntervalMs: 0,
      fetcher,
      onMetric: (m) => {
        metrics.push(m);
      },
    });

    await client("writer", "write", z.object({ ok: z.boolean() }));
    await client("reviewer", "review", z.object({ ok: z.boolean() }));
    expect(requests.map((r) => r.headers["x-goog-api-key"])).toEqual([
      "writer-secret",
      "review-secret",
    ]);

    expect(JSON.parse(requests[0].body)).toMatchObject({
      store: false,
      generationConfig: { responseMimeType: "application/json" },
    });

    expect(JSON.stringify(metrics)).not.toContain("secret");
    expect(metrics).toHaveLength(2);
  });

  it("does not send a request without a key", async () => {
    const fetcher: any = vi.fn();
    const client = createGeminiClient({
      model: "m",
      writerKey: "",
      reviewerKey: "r",
      fetcher,
    });

    await expect(client("writer", "x", z.object({}))).rejects.toThrow(
      "GEMINI_API_KEY_WRITER",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never retries quota errors and never exposes provider error bodies", async () => {
    const fetcher: any = vi.fn(
      async () => new Response("sensitive-provider-body", { status: 429 }),
    );
    const client = createGeminiClient({
      model: "m",
      writerKey: "secret",
      reviewerKey: "r",
      fetcher,
    });

    await expect(client("writer", "x", z.object({}))).rejects.toThrow(
      "HTTP 429",
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated output even when it contains parseable JSON", () => {
    expect(() =>
      parseGeminiResponse({
        candidates: [
          { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } },
        ],
      }),
    ).toThrow("did not complete");
  });

  it("stops at the configured call budget and refuses malformed JSON", async () => {
    const fetcher: any = vi.fn(
      async () => new Response(JSON.stringify(envelope({ wrong: true }))),
    );
    const client = createGeminiClient({
      model: "m",
      writerKey: "w",
      reviewerKey: "r",
      fetcher,
      minIntervalMs: 0,
      maxCalls: 1,
    });

    await expect(
      client("writer", "x", z.object({ ok: z.boolean() })),
    ).rejects.toThrow("format");

    await expect(client("reviewer", "x", z.object({}))).rejects.toThrow(
      "execution limit",
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini compatibility and diagnostics", () => {
  it("simplifies wire enums while retaining the strict local contract", () => {
    const original = {
      type: "string",
      enum: Array.from({ length: 30 }, (_, i) => "id" + i),
      minLength: 2,
    };

    expect(geminiWireSchema(original)).toEqual({ type: "string" });
    expect(original.enum).toHaveLength(30);
  });

  it("redacts both credentials from server diagnostics and does not retry 503", async () => {
    const fetcher: any = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              status: "UNAVAILABLE",
              message: "writer-secret reviewer-secret service unavailable",
            },
          }),
          { status: 503 },
        ),
    );
    const client = createGeminiClient({
      model: "m",
      writerKey: "writer-secret",
      reviewerKey: "reviewer-secret",
      fetcher,
    });
    let message = "";

    try {
      await client("writer", "test", z.object({}));
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain("503");
    expect(message).toContain("UNAVAILABLE");
    expect(message).not.toContain("writer-secret");
    expect(message).not.toContain("reviewer-secret");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("Gemini diagnostic preservation", () => {
  it("records full API error details without credentials and sends only one request", async () => {
    const details = [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [
          {
            field: "generation_config.thinking_config",
            description: "Unsupported level",
          },
        ],
      },
    ];
    const diagnostics: any[] = [];
    const fetcher: any = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              status: "INVALID_ARGUMENT",
              message: "writer-secret invalid",
              details,
            },
          }),
          { status: 400, headers: { "x-request-id": "test-request" } },
        ),
    );
    const infer = createGeminiClient({
      model: "gemini-flash-latest",
      writerKey: "writer-secret",
      reviewerKey: "reviewer-secret",
      fetcher,
      onDiagnostic: (d) => {
        diagnostics.push(d);
      },
    });

    await expect(
      infer("writer", "test", z.object({ ok: z.boolean() })),
    ).rejects.toThrow("400");

    const response = diagnostics.find((d) => d.phase === "response");

    expect(response.body.error.details).toEqual(details);
    expect(response.requestId).toBe("test-request");
    expect(JSON.stringify(diagnostics)).not.toContain("writer-secret");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini resume and authorized backoff", () => {
  it("resumes at the review without calling the writer again", async () => {
    const draft = output().draft;
    const before = JSON.stringify(draft);
    const roles: string[] = [];
    const selection = {
      requirements: [],
      selectedSkills: ["React"],
      priorities: [{ sourceId: "company", evidenceIds: ["f1"] }],
    };
    const infer: any = async (role: string) => {
      roles.push(role);

      return approved();
    };
    const result = await runGeminiCv(infer, profile, job, {
      pendingReview: { draft, selection, round: 0 },
    });

    expect(roles).toEqual(["reviewer"]);
    expect(result.calls).toBe(1);
    expect(result.review.approved).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("retries with exactly 2, 4 and 6 seconds, reusing the same payload", async () => {
    const requests: string[] = [];
    const sleep = vi.fn(async (_ms: number) => {});
    const fetcher: any = async (_url: string, init: any) => {
      requests.push(init.body);

      return requests.length < 4
        ? new Response(
            JSON.stringify({
              error: { status: "UNAVAILABLE", message: "high demand" },
            }),
            { status: 503 },
          )
        : new Response(JSON.stringify(envelope({ ok: true })));
    };
    const client = createGeminiClient({
      model: "gemini-flash-latest",
      writerKey: "w",
      reviewerKey: "r",
      fetcher,
      sleep,
      retryDelaysMs: [2000, 4000, 6000],
    });

    expect(
      await client("reviewer", "same cv", z.object({ ok: z.boolean() })),
    ).toEqual({ ok: true });

    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 6000]);
    expect(new Set(requests).size).toBe(1);
  });

  it("stops after four failed attempts and does not retry client or quota errors", async () => {
    for (const status of [503, 400, 429]) {
      const sleep = vi.fn(async (_ms: number) => {});
      const fetcher: any = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { status: "ERROR", message: "failure" } }),
            { status },
          ),
      );
      const client = createGeminiClient({
        model: "m",
        writerKey: "w",
        reviewerKey: "r",
        fetcher,
        sleep,
        retryDelaysMs: [2000, 4000, 6000],
      });

      await expect(client("reviewer", "x", z.object({}))).rejects.toThrow(
        String(status),
      );

      expect(fetcher).toHaveBeenCalledTimes(status === 503 ? 4 : 1);
    }
  });

  it("stops instead of ignoring a provider Retry-After exceeding the authorized delay", async () => {
    const fetcher: any = vi.fn(
      async () =>
        new Response("{}", { status: 503, headers: { "retry-after": "60" } }),
    );
    const sleep = vi.fn(async () => {});
    const client = createGeminiClient({
      model: "m",
      writerKey: "w",
      reviewerKey: "r",
      fetcher,
      sleep,
      retryDelaysMs: [2000, 4000, 6000],
    });

    await expect(client("reviewer", "x", z.object({}))).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});
