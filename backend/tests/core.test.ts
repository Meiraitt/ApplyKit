import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { config } from "dotenv";

config({
  path: new URL("../../.env", import.meta.url).pathname.replace(
    /^\/([A-Z]:)/,
    "$1",
  ),
});

// These orchestration fixtures mock the Ollama boundary; never inherit the user's live CLI provider.
process.env.CV_PROVIDER = "ollama";
process.env.OLLAMA_MODEL_WRITER = "test-model";
process.env.OLLAMA_MODEL_REVIEWER = "test-model";
process.env.GEMINI_API_KEY_WRITER = "fake-writer-key";
process.env.GEMINI_API_KEY_REVIEWER = "fake-reviewer-key";
process.env.TELEGRAM_CHAT_ID = "900001";
process.env.TELEGRAM_BOT_TOKEN = "test-token-not-real";
// Only the dedicated test database is cleared. Never run destructive test setup against the app DB.
const testUrl = new URL(process.env.DATABASE_URL!);

testUrl.pathname = "/applykit_test";
process.env.DATABASE_URL = testUrl.toString();
const { pool, migrate, transaction } = await import(
  "../src/infrastructure/database/db.js"
);
const { boss, startQueue } = await import(
  "../src/infrastructure/queue/queue.js"
);
const { createSubmission, requestGeneration, getVacancy, requestRepair } =
  await import("../src/services/jobs.service.js");
const { createApp } = await import("../src/app.js");
const { processGeneration, realServices: actualServices } = await import(
  "../src/services/generation.service.js"
);
const { reviewerPrompt } = await import("../src/prompts/prompts.js");
const { reviewSchema } = await import("../src/domain/types.js");
// Review orchestration has a single boundary here; reviewer.test.ts exercises each factual pass.
const productionServices = {
  ...actualServices,
  loadProfile: async () =>
    (await import("./fixtures/profile.js")).loadProfile(),
  reviewDraft: async (
    infer: any,
    model: any,
    profile: any,
    job: any,
    draft: any,
    selection: any,
  ) =>
    infer(model, reviewerPrompt(profile, job, draft, selection), reviewSchema),
};
const { draftSchemaFor } = await import("../src/domain/types.js");
// Mock only the writer boundary in orchestration tests; writer.ts has dedicated contract tests.
const realServices = {
  ...productionServices,
  writeDraft: async (
    infer: any,
    model: any,
    profile: any,
    job: any,
    review: any,
    draft: any,
    selection: any,
  ) =>
    infer(
      model,
      JSON.stringify({ profile, job, review, previousDraft: draft, selection }),
      draftSchemaFor(profile),
    ),
};
const { parsePage, canonicalUrl, validatePublicUrl, NeedsDescription } =
  await import("../src/infrastructure/importer/importer.js");
const { validateEvidence } = await import("../src/domain/cv/cv.js");
const { loadProfile } = await import("./fixtures/profile.js");
const { receiveUpdate } = await import(
  "../src/integrations/telegram/telegram.js"
);
const { env } = await import("../src/config/config.js");
const { docxBuffer, cvHtml } = await import(
  "../src/infrastructure/documents/render.js"
);
const { assembleCv } = await import("../src/domain/cv/cv.js");
const { recoverInterruptedJobs } = await import(
  "../src/infrastructure/queue/recovery.js"
);
const { deliverOutbox } = await import(
  "../src/integrations/telegram/telegram.js"
);
const app = createApp();
const description =
  "Desenvolvedor frontend com React e TypeScript. Desenvolver interfaces, integrar APIs REST e colaborar em code reviews. Trabalho remoto no Brasil.";
const { dashboard } = await import(
  "../src/repositories/dashboard.repository.js"
);
const selection = {
  requirements: [],
  selectedSkills: ["React", "TypeScript"],
  priorities: [
    { sourceId: "atlas", evidenceIds: ["l1"] },
    { sourceId: "beacon", evidenceIds: ["k1", "k2", "k3", "k4"] },
    { sourceId: "cedar-dev", evidenceIds: ["z1"] },
  ],
};
const submission = {
  title: "Frontend Developer",
  company: "Empresa teste",
  description,
  language: "pt-BR" as const,
};

beforeAll(async () => {
  expect(new URL(env.databaseUrl).pathname).toBe("/applykit_test");
  await migrate();
  await startQueue();
  await pool.query(
    "TRUNCATE telegram_outbox,telegram_updates,app_state,generations,vacancies CASCADE",
  );

  await pool.query("DELETE FROM pgboss.job");
}, 30000);

afterAll(async () => {
  await boss.stop();
  await pool.end();
});

describe("Dashboard semanal", () => {
  it("counts applications by application week and respects Monday in the configured timezone", async () => {
    await transaction(async (db) => {
      await db.query("SAVEPOINT weekly_test");
      const id = "00000000-0000-4000-8000-000000000001";

      await db.query(
        "INSERT INTO vacancies(id,title,source,saved_at,applied_at) VALUES($1,'Calendário','test','2025-12-29T02:30:00Z','2026-01-05T03:30:00Z')",
        [id],
      );

      const stats = await dashboard(4, new Date("2026-01-07T12:00:00Z"), db);

      expect(stats.weekly).toEqual([
        { week: "2025-12-15", saved: 0, applied: 0 },
        { week: "2025-12-22", saved: 1, applied: 0 },
        { week: "2025-12-29", saved: 0, applied: 0 },
        { week: "2026-01-05", saved: 0, applied: 1 },
      ]);

      await db.query("ROLLBACK TO SAVEPOINT weekly_test");
    });
  });

  it("validates date ranges and returns empty weeks", async () => {
    await request(app).get("/api/dashboard?weeks=100").expect(400);
    const result = await request(app).get("/api/dashboard?weeks=8").expect(200);

    expect(result.body.weekly).toHaveLength(8);
    expect(result.body.timezone).toBe("America/Sao_Paulo");
  });
});

describe("Interactive Telegram", () => {
  let sequence = 900000;
  const chat = Number(env.telegramChat);
  const send = async (text: string) => {
    const update_id = ++sequence;

    await receiveUpdate({ update_id, message: { chat: { id: chat }, text } });

    return (
      await pool.query("SELECT * FROM telegram_outbox WHERE dedup_key=$1", [
        `reply:${update_id}`,
      ])
    ).rows[0];
  };
  const click = async (data: string, from = chat) => {
    const update_id = ++sequence;
    const update = {
      update_id,
      callback_query: {
        id: String(update_id),
        from: { id: from },
        message: { chat: { id: chat } },
        data,
      },
    };

    await receiveUpdate(update);

    return {
      update,
      reply: (
        await pool.query("SELECT * FROM telegram_outbox WHERE dedup_key=$1", [
          `reply:${update_id}`,
        ])
      ).rows[0],
    };
  };

  it("opens the menu, preserves invalid pending input and saves guided descriptions", async () => {
    expect((await send("/start")).reply_markup.keyboard[0][0].text).toBe(
      "New job",
    );

    expect((await send("New job")).reply_markup.force_reply).toBe(true);
    expect((await send("curta")).text).toContain("Could not complete");
    expect(
      (
        await pool.query("SELECT value FROM app_state WHERE key=$1", [
          `conversation:${chat}`,
        ])
      ).rowCount,
    ).toBe(1);

    expect((await send(description + " Conversa guiada")).text).toContain(
      "Job saved",
    );

    expect(
      (
        await pool.query("SELECT value FROM app_state WHERE key=$1", [
          `conversation:${chat}`,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("cancels and expires input without saving accidental content", async () => {
    await send("New job");
    expect((await send("Cancel")).text).toContain("cancelled");
    await send("New job");
    await pool.query("UPDATE app_state SET value=$2 WHERE key=$1", [
      `conversation:${chat}`,
      JSON.stringify({ kind: "job", expires: 1 }),
    ]);

    expect((await send(description)).text).toContain("expired");
  });

  it("authorizes and deduplicates callbacks for generation, editing and application dates", async () => {
    const item = await createSubmission({ ...submission, title: "Botões" });
    const id = item.vacancy.id;

    expect((await click(`generate:${id}`, 1)).reply).toBeUndefined();
    const result = await click(`generate:${id}`);

    await receiveUpdate(result.update);
    expect(result.reply.text).toContain("Generation queued");
    expect((await getVacancy(id)).generations).toHaveLength(1);
    await click(`data:${id}`);
    expect((await send("2026-02-30")).text).toContain("valid date");
    expect((await send("today")).text).toContain("Application recorded");
    expect((await getVacancy(id)).applied_at).toBeTruthy();
    expect((await click(`unapplied:${id}`)).reply.text).toContain("removed");

    await pool.query(
      "UPDATE generations SET state='needs_input' WHERE vacancy_id=$1",
      [id],
    );

    await click(`description:${id}`);
    expect((await send(description + " Edição pelo botão")).text).toContain(
      "Description saved",
    );

    expect((await getVacancy(id)).generations).toHaveLength(2);
    const status = (await click(`status:${id}`)).reply;

    expect(
      status.reply_markup.inline_keyboard
        .flat()
        .some((b: any) => b.text === "Generate CV"),
    ).toBe(true);
  });

  it("lists pages with job buttons and navigation", async () => {
    for (let i = 0; i < 7; i++)
      await createSubmission({ ...submission, title: `Paginação ${i}` });
    const first = await send("My jobs");

    expect(
      first.reply_markup.inline_keyboard
        .flat()
        .some((b: any) => b.callback_data === "list:1"),
    ).toBe(true);

    const second = (await click("list:1")).reply;

    expect(second.text).toContain("page 2");
    expect(
      second.reply_markup.inline_keyboard
        .flat()
        .some((b: any) => b.callback_data === "list:0"),
    ).toBe(true);
  });
});

describe("Intake and durable queue", () => {
  it("saves jobs and tasks transactionally and deduplicates repeated input", async () => {
    const first = await createSubmission(submission);
    const duplicate = await createSubmission(submission);

    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.vacancy.id).toBe(first.vacancy.id);
    expect(
      (
        await pool.query("SELECT id FROM pgboss.job WHERE id=$1", [
          first.generationId,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it("rollback leaves no orphan job or task", async () => {
    let id: string | undefined;

    await expect(
      transaction(async (db) => {
        const r = await createSubmission(
          { ...submission, title: "Rollback" },
          { db },
        );

        id = r.generationId!;

        throw new Error("simular queda");
      }),
    ).rejects.toThrow("simular queda");

    expect(
      (await pool.query("SELECT id FROM generations WHERE id=$1", [id]))
        .rowCount,
    ).toBe(0);

    expect(
      (await pool.query("SELECT id FROM pgboss.job WHERE id=$1", [id]))
        .rowCount,
    ).toBe(0);
  });

  it("concurrent requests reuse the active generation", async () => {
    const item = await createSubmission({
      ...submission,
      title: "Concorrência",
    });
    const ids = await Promise.all([
      requestGeneration(item.vacancy.id),
      requestGeneration(item.vacancy.id),
    ]);

    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(item.generationId);
  });
});

describe("Import", () => {
  it("extracts JobPosting JSON-LD and preserves paragraphs", () => {
    const result = parsePage(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "React", hiringOrganization: { name: "Acme" }, description: `<p>${description}</p><p>Segunda seção.</p>` })}</script>`,
      "https://example.com/job",
    );

    expect(result.company).toBe("Acme");
    expect(result.description).toContain("\n");
  });

  it("extracts full feed post content", () => {
    expect(
      parsePage(
        `<div class="attributed-text-segment-list__content">${description}</div>`,
        "https://www.linkedin.com/posts/test",
      ).description,
    ).toBe(description);
  });

  it("rejects login pages and truncated metadata as descriptions", () => {
    expect(() =>
      parsePage(
        '<h1>Sign in</h1><meta property="og:description" content="Vaga...">',
        "https://example.com",
      ),
    ).toThrow(NeedsDescription);
  });

  it("normalizes tracking and blocks local networks", async () => {
    expect(
      canonicalUrl("https://example.com/vaga?utm_source=foo&jk=123#abc"),
    ).toBe("https://example.com/vaga?jk=123");

    await expect(validatePublicUrl("http://127.0.0.1/foo")).rejects.toThrow();
    await expect(validatePublicUrl("http://[::1]/foo")).rejects.toThrow();
    expect(() => canonicalUrl("file:///etc/passwd")).toThrow();
  });

  it("keeps jobs recoverable when URLs are blocked", async () => {
    const r = await createSubmission({
      ...submission,
      title: "Bloqueada",
      description: "",
      url: "https://example.com/blocked",
    });

    await processGeneration(r.generationId!, {
      ...realServices,
      extractUrl: async () => {
        throw new NeedsDescription("Cole a descrição.");
      },
    });

    const v = await getVacancy(r.vacancy.id);

    expect(v.generations[0].state).toBe("needs_input");
    expect(v.url).toContain("blocked");
  });
});

describe("CVs", () => {
  it("accepts equivalent number abbreviations and blocks unsupported adjectives", async () => {
    const profile = await loadProfile();
    const draft = {
      summary:
        "Contribuiu para uma plataforma com mais de 25K usuários cadastrados.",
      summaryEvidenceIds: ["k1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            {
              text: "Contribuiu para plataforma financeira com mais de 25,000 usuários cadastrados.",
              evidenceIds: ["k1"],
            },
          ],
        },
      ],
    };

    expect(validateEvidence(draft, profile)).toEqual([]);
    expect(
      validateEvidence(
        {
          ...draft,
          summary:
            "Desenvolvedor de sistemas complexos e escaláveis de alta performance.",
        },
        profile,
      ),
    ).toHaveLength(3);

    expect(
      validateEvidence(
        {
          ...draft,
          summary:
            "Contribuiu para plataforma com mais de 400K usuários cadastrados.",
        },
        profile,
      ),
    ).toContain("Unsupported number (400000) in summary.");

    const falseSummary = {
      ...draft,
      summary: "Liderou uma equipe usando Python e Rust.",
    };

    expect(
      validateEvidence(falseSummary, profile).some((i) => i.includes("Python")),
    ).toBe(true);

    expect(
      validateEvidence(falseSummary, profile).some((i) => i.includes("Rust")),
    ).toBe(true);

    expect(
      validateEvidence(falseSummary, profile).some((i) =>
        i.includes("Liderou"),
      ),
    ).toBe(true);
  });

  it("distinguishes Java from JavaScript without inventing gaps for supported activities", async () => {
    const {
      groundSelection,
      reconcileMissing,
      reconcileQuestions,
      requirementSupport,
    } = await import("../src/domain/cv/tailoring.js");
    const profile = await loadProfile();
    const requirements = [
      "TypeScript",
      "Java",
      "Rust",
      "Algoritmos",
      "Correction de bugs",
      "Refatoração de código",
      "Otimização de performance",
    ];
    const plan = groundSelection(
      profile,
      {
        requirements: requirements.map((requirement) => ({
          requirement,
          evidenceIds: [],
        })),
        selectedSkills: ["React"],
        priorities: [],
      },
      requirements.join("\n"),
    );

    expect(requirementSupport(profile, "Java").supported).toBe(false);
    expect(requirementSupport(profile, "JavaScript").supported).toBe(true);
    expect(
      reconcileMissing(profile, plan, [
        "Correction de bugs",
        "Otimização de performance",
        "Inglês fluente",
      ]),
    ).toEqual(["Java", "Rust", "Algoritmos"]);

    expect(
      plan.priorities.find((p) => p.sourceId === "beacon")!.evidenceIds,
    ).toContain("k3");

    expect(plan.selectedSkills[0]).toBe("TypeScript");
    expect(plan.selectedSkills).not.toContain("Docker");
    expect(requirementSupport(profile, "5 anos de React").known).toBe(false);
    expect(
      reconcileMissing(
        profile,
        {
          ...plan,
          requirements: [
            { requirement: "5 anos de React", evidenceIds: ["k1"] },
          ],
        },
        [],
      ),
    ).toEqual(["Unverified: 5 anos de React"]);

    expect(
      reconcileQuestions(profile, [
        "Pode quantificar o impacto da refatoração?",
      ]),
    ).toEqual([]);
  });

  it("selects and orders facts without cross-experience attribution", async () => {
    const { focusProfile } = await import("../src/domain/cv/tailoring.js");
    const profile = await loadProfile();
    const focused = focusProfile(
      profile,
      {
        requirements: [],
        selectedSkills: ["React", "TypeScript", "JavaScript"],
        priorities: [
          { sourceId: "beacon", evidenceIds: ["k4", "z1", "k3", "k4"] },
        ],
      },
      "Precisamos de TypeScript e Java.",
    );

    expect(focused.skills).toEqual(["TypeScript", "React", "JavaScript"]);
    expect(focused.experiences[0].facts.slice(0, 2).map((f) => f.id)).toEqual([
      "k4",
      "k3",
    ]);

    expect(focused.summary).toBe("");
    expect(
      profile.experiences.find((e) => e.id === "beacon")!.facts[0].id,
    ).toBe("k1");
  });

  it("validates summary numbers and references", async () => {
    const profile = await loadProfile();
    const draft = {
      summary: "Desenvolvedor que aumentou a receita em 99%.",
      summaryEvidenceIds: ["k1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            { text: "Desenvolveu aplicações com React.", evidenceIds: ["k1"] },
          ],
        },
      ],
    };

    expect(validateEvidence(draft, profile)).toContain(
      "Unsupported number (99%) in summary.",
    );

    expect(
      validateEvidence(
        { ...draft, summaryEvidenceIds: ["inexistente"] },
        profile,
      ),
    ).toContain("Invalid summary reference.");

    const { draftSchemaFor } = await import("../src/domain/types.js");

    expect(
      draftSchemaFor(profile).safeParse({
        ...draft,
        summaryEvidenceIds: undefined,
      }).success,
    ).toBe(false);
  });

  it("applies editorial feedback to the prior draft and persists evidence", async () => {
    const draft = {
      summary: "Desenvolvedor com experiência em aplicações web.",
      summaryEvidenceIds: ["k1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            { text: "Desenvolveu aplicações com React.", evidenceIds: ["k1"] },
          ],
        },
      ],
    };
    const revised = {
      ...draft,
      summary:
        "Desenvolvedor de aplicações React para uma plataforma financeira.",
    };
    const review = {
      approved: true,
      issues: [
        {
          severity: "suggestion",
          section: "Resumo",
          problem: "Texto genérico",
          fix: "Explicitar o contexto financeiro registrado em k1.",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce(selection)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce(revised)
      .mockResolvedValueOnce({ ...review, issues: [] });
    const r = await createSubmission({
      ...submission,
      title: "Review editorial",
    });

    await processGeneration(r.generationId!, {
      ...realServices,
      generate,
      renderArtifacts: async () => ({ pdf: "test.pdf", docx: "test.docx" }),
    });

    const row = (
      await pool.query("SELECT * FROM generations WHERE id=$1", [
        r.generationId,
      ])
    ).rows[0];

    expect(generate).toHaveBeenCalledTimes(5);
    expect(generate.mock.calls[3][1]).toContain("previousDraft");
    expect(row.cv.summary).toBe(revised.summary);
    expect(row.draft.summaryEvidenceIds).toEqual(["k1"]);
    expect(row.state).toBe("ready");
  });

  it.each(["reprovada", "indisponível"])(
    "preserves the approved version when rewriting is %s",
    async (mode) => {
      const draft = {
        summary: "Desenvolvedor com experiência em aplicações React.",
        summaryEvidenceIds: ["k1"],
        skills: ["React"],
        experiences: [
          {
            sourceId: "beacon",
            bullets: [
              {
                text: "Desenvolveu aplicações com React.",
                evidenceIds: ["k1"],
              },
            ],
          },
        ],
      };
      const review = {
        approved: true,
        issues: [
          {
            severity: "suggestion",
            section: "Resumo",
            problem: "Contexto ausente",
            fix: "Explicitar produto financeiro.",
          },
        ],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      };
      const generate = vi
        .fn()
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(review);

      if (mode === "indisponível")
        generate.mockRejectedValueOnce(new Error("Ollama offline"));
      else
        generate
          .mockResolvedValueOnce({
            ...draft,
            summary: "Aumentou receita em 99% usando React.",
          })
          .mockResolvedValueOnce({
            approved: true,
            issues: [],
            strengths: [],
            missingRequirements: [],
            questionsForCandidate: [],
          });
      const r = await createSubmission({
        ...submission,
        title: `Fallback ${mode}`,
      });

      await processGeneration(r.generationId!, {
        ...realServices,
        generate,
        renderArtifacts: async () => ({ pdf: "test.pdf", docx: "test.docx" }),
      });

      const job = await getVacancy(r.vacancy.id);

      expect(job.generations[0].state).toBe("ready");
      expect(job.generations[0].cv.summary).toBe(draft.summary);
      expect(job.generations[0].review.issues[0].severity).toBe("suggestion");
    },
  );

  it.each(["pt-BR", "en"] as const)(
    "entrega os bloqueios de evidências ao escritor real e corrige o resumo em %s",
    async (language) => {
      const profile = {
        ...(await loadProfile()),
        skills: ["React"],
        experiences: [
          {
            id: "sample",
            company: "Empresa",
            role: "Developer",
            period: "2025",
            kind: "work" as const,
            facts: [{ id: "f1", text: "Desenvolveu interfaces com React." }],
          },
        ],
      };
      const prompts: string[] = [];
      const bad =
        language === "en"
          ? {
              positioning: "Software developer with expertise in React",
              contributions: "Worked on web application interfaces",
            }
          : {
              positioning: "Desenvolvedor com expertise em React",
              contributions: "Atuação em interfaces de aplicações web",
            };
      const good =
        language === "en"
          ? {
              positioning: "Software developer with experience in React",
              contributions: "Worked on web application interfaces",
            }
          : {
              positioning: "Desenvolvedor com experiência em React",
              contributions: "Atuação em interfaces de aplicações web",
            };
      const generate = vi.fn(
        async (_model: string, prompt: string, schema: any) => {
          if (schema.shape.requirements)
            return {
              requirements: [],
              selectedSkills: ["React"],
              priorities: [{ sourceId: "sample", evidenceIds: ["f1"] }],
            };

          if (schema.shape.approved)
            return {
              approved: true,
              issues: [],
              strengths: [],
              missingRequirements: [],
              questionsForCandidate: [],
            };

          if (schema.shape.summary) {
            prompts.push(prompt);
            const r = prompt.includes("Unsupported summary attribute")
              ? good
              : bad;

            return {
              summary: r.positioning + ". " + r.contributions + ".",
              summaryEvidenceIds: ["f1"],
              skills: ["React"],
            };
          }

          return {
            bullets: [
              {
                text:
                  language === "en"
                    ? "Developed interfaces with React."
                    : profile.experiences[0].facts[0].text,
                evidenceIds: ["f1"],
              },
            ],
          };
        },
      );
      const renderArtifacts = vi.fn(async () => ({
        pdf: "test.pdf",
        docx: "test.docx",
      }));
      const r = await createSubmission({
        ...submission,
        title: `Software Engineer ${language}`,
        language,
      });

      await processGeneration(r.generationId!, {
        ...productionServices,
        loadProfile: async () => profile,
        generate: generate as any,
        renderArtifacts,
      });

      const row = (
        await pool.query("SELECT * FROM generations WHERE id=$1", [
          r.generationId,
        ])
      ).rows[0];

      expect(prompts).toHaveLength(2);
      const feedback = JSON.parse(
        prompts[1].split("<CORRIGIR>")[1].split("</CORRIGIR>")[0],
      );

      expect(feedback).toEqual(
        expect.arrayContaining([expect.stringContaining("expertise")]),
      );

      expect(prompts[1]).toContain(bad.positioning);
      expect(row.state).toBe("ready");
      expect(row.draft.summary).toContain(good.positioning);
      expect(row.draft.summary).not.toContain("expertise");
      expect(validateEvidence(row.draft, profile)).toEqual([]);
      expect(row.draft.summaryEvidenceIds).toEqual(["f1"]);
      expect(row.draft.experiences[0].bullets[0].evidenceIds).toEqual(["f1"]);
      expect(renderArtifacts).toHaveBeenCalledTimes(1);
    },
  );

  it("forwards semantic feedback with nonstandard section labels", async () => {
    const profile = {
      ...(await loadProfile()),
      skills: ["React"],
      experiences: [
        {
          id: "sample",
          company: "Empresa",
          role: "Developer",
          period: "2025",
          kind: "work" as const,
          facts: [{ id: "f1", text: "Desenvolveu interfaces com React." }],
        },
      ],
    };
    const issue = {
      severity: "blocking" as const,
      section: "Fidelidade",
      problem:
        "O resumo afirma que treinou desenvolvedores, mas f1 só comprova interfaces React.",
      fix: "Remova a atividade de treinamento e descreva somente o desenvolvimento de interfaces de f1.",
    };
    const prompts: string[] = [];
    let reviews = 0;
    const generate = vi.fn(
      async (_model: string, prompt: string, schema: any) => {
        if (schema.shape.requirements)
          return {
            requirements: [],
            selectedSkills: ["React"],
            priorities: [{ sourceId: "sample", evidenceIds: ["f1"] }],
          };

        if (schema.shape.approved) {
          reviews++;

          return {
            approved: reviews > 1,
            issues: reviews === 1 ? [issue] : [],
            strengths: [],
            missingRequirements: [],
            questionsForCandidate: [],
          };
        }

        if (schema.shape.summary) {
          prompts.push(prompt);

          return {
            summary:
              "Desenvolvedor de aplicações com React. " +
              (prompt.includes(issue.fix)
                ? "Atuação no desenvolvimento de interfaces web."
                : "Treinou desenvolvedores em aplicações web."),
            summaryEvidenceIds: ["f1"],
            skills: ["React"],
          };
        }

        return {
          bullets: [
            { text: profile.experiences[0].facts[0].text, evidenceIds: ["f1"] },
          ],
        };
      },
    );
    const r = await createSubmission({
      ...submission,
      title: "Software Engineer revisão semântica",
    });

    await processGeneration(r.generationId!, {
      ...productionServices,
      loadProfile: async () => profile,
      generate: generate as any,
      renderArtifacts: async () => ({ pdf: "test.pdf", docx: "test.docx" }),
    });

    expect(prompts).toHaveLength(2);
    expect(
      JSON.parse(prompts[1].split("<REVIEW>")[1].split("</REVIEW>")[0]),
    ).toContainEqual(issue);

    const result = (await getVacancy(r.vacancy.id)).generations[0];

    expect(result.state).toBe("ready");
    expect(result.cv.summary).not.toContain("Treinou");
    expect(result.cv.summary).toContain("desenvolvimento de interfaces web");
  });

  it("keeps the CV blocked when the writer repeats unsupported claims", async () => {
    const profile = {
      ...(await loadProfile()),
      skills: ["React"],
      experiences: [
        {
          id: "sample",
          company: "Empresa",
          role: "Developer",
          period: "2025",
          kind: "work" as const,
          facts: [{ id: "f1", text: "Desenvolveu interfaces com React." }],
        },
      ],
    };
    const prompts: string[] = [];
    const generate = vi.fn(
      async (_model: string, prompt: string, schema: any) => {
        if (schema.shape.requirements)
          return {
            requirements: [],
            selectedSkills: ["React"],
            priorities: [{ sourceId: "sample", evidenceIds: ["f1"] }],
          };

        if (schema.shape.approved)
          return {
            approved: true,
            issues: [],
            strengths: [],
            missingRequirements: [],
            questionsForCandidate: [],
          };

        if (schema.shape.summary) {
          prompts.push(prompt);

          return {
            summary:
              "Desenvolvedor com expertise em React. Atuação em interfaces de aplicações web.",
            summaryEvidenceIds: ["f1"],
            skills: ["React"],
          };
        }

        return {
          bullets: [
            { text: profile.experiences[0].facts[0].text, evidenceIds: ["f1"] },
          ],
        };
      },
    );
    const renderArtifacts = vi.fn();
    const r = await createSubmission({
      ...submission,
      title: "Software Engineer persistente",
    });

    await processGeneration(r.generationId!, {
      ...productionServices,
      loadProfile: async () => profile,
      generate: generate as any,
      renderArtifacts,
    });

    expect(prompts).toHaveLength(4);
    expect(prompts[1]).toContain("Unsupported summary attribute");
    expect(prompts[3]).toContain("Unsupported summary attribute");
    expect((await getVacancy(r.vacancy.id)).generations[0].state).toBe(
      "needs_review",
    );

    expect(renderArtifacts).not.toHaveBeenCalled();
    await request(app)
      .get(`/api/generations/${r.generationId}/pdf`)
      .expect(404);
  });

  it("reviews, renders and preserves snapshots without repeating completed generation", async () => {
    const profile = await loadProfile();
    const draft = {
      summary:
        "Desenvolvedor de software com experiência em React e TypeScript, integração com APIs e evolução de interfaces.",
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            {
              text: "Entregou funcionalidades frontend e backend em Node.js, integrando APIs REST e GraphQL.",
              evidenceIds: ["k2"],
            },
          ],
        },
      ],
    };
    const review = {
      approved: true,
      issues: [],
      strengths: ["Texto claro"],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce(selection)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(review);
    const renderArtifacts = vi.fn(async () => ({
      pdf: "test.pdf",
      docx: "test.docx",
    }));
    const r = await createSubmission({ ...submission, title: "CV aprovado" });

    await processGeneration(r.generationId!, {
      ...realServices,
      generate,
      renderArtifacts,
    });

    await processGeneration(r.generationId!, {
      ...realServices,
      generate,
      renderArtifacts,
    });

    const row = (
      await pool.query("SELECT * FROM generations WHERE id=$1", [
        r.generationId,
      ])
    ).rows[0];

    expect(row.state).toBe("ready");
    expect(row.profile_snapshot.name).toBe(profile.name);
    expect(row.vacancy_snapshot.description).toBe(description);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(renderArtifacts).toHaveBeenCalledTimes(1);
    const cv = assembleCv(draft, profile, "pt-BR");

    expect(cvHtml(cv)).toContain("Resumo profissional");
    expect((await docxBuffer(cv)).subarray(0, 2).toString()).toBe("PK");
  });

  it("blocks inflated authorship despite model approval and forwards it for correction", async () => {
    const draft = {
      summary: "Desenvolvedor com experiência em aplicações React.",
      summaryEvidenceIds: ["l1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "atlas",
          bullets: [
            {
              text: "Implementou um endpoint Node.js e NestJS para salvar drafts e implementou a hidratação do estado no frontend.",
              evidenceIds: ["l4"],
            },
          ],
        },
      ],
    };
    const approved = {
      approved: true,
      issues: [],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce(selection)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...approved, issues: [] });
    const renderArtifacts = vi.fn(),
      r = await createSubmission({ ...submission, title: "Autoria por ação" });

    await processGeneration(r.generationId!, {
      ...realServices,
      generate,
      renderArtifacts,
    });

    const row = (await getVacancy(r.vacancy.id)).generations[0];

    expect(row.state).toBe("needs_review");
    expect(
      row.review.issues.some((i: any) =>
        i.problem.includes("Inflated endpoint authorship"),
      ),
    ).toBe(true);

    expect(generate.mock.calls[3][1]).toContain("Inflated endpoint authorship");
    expect(renderArtifacts).not.toHaveBeenCalled();
    await request(app)
      .get(`/api/generations/${r.generationId}/pdf`)
      .expect(404);
  });

  it("blocks invented skills, cross-company evidence and new numbers", async () => {
    const profile = await loadProfile();
    const issues = validateEvidence(
      {
        summary: "Experiência técnica",
        skills: ["Rust"],
        experiences: [
          {
            sourceId: "beacon",
            bullets: [
              {
                text: "Aumentei vendas em 999% usando Rust.",
                evidenceIds: ["z1"],
              },
            ],
          },
        ],
      },
      profile,
    );

    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts equivalent numeric translations and constrains model choices", async () => {
    const profile = await loadProfile();
    const draft = {
      summary: "Software engineer with frontend experience.",
      summaryEvidenceIds: ["k1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            {
              text: "Developed applications for a platform with over 25,000 registered users.",
              evidenceIds: ["k1"],
            },
          ],
        },
      ],
    };

    expect(validateEvidence(draft, profile)).toEqual([]);
    const { draftSchemaFor } = await import("../src/domain/types.js");

    expect(
      draftSchemaFor(profile).safeParse({ ...draft, skills: ["Rust"] }).success,
    ).toBe(false);

    expect(draftSchemaFor(profile).safeParse(draft).success).toBe(true);
  });

  it("does not release downloads when both reviews reject the CV", async () => {
    const draft = {
      summary: "Experiência em desenvolvimento de aplicações web.",
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            {
              text: "Contribuí para desenvolvimento de aplicações em React.",
              evidenceIds: ["k1"],
            },
          ],
        },
      ],
    };
    const review = {
      approved: false,
      issues: [
        {
          severity: "blocking",
          section: "Resumo",
          problem: "Review pendente",
          fix: "Revisar",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce(selection)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(review);
    const renderArtifacts = vi.fn();
    const r = await createSubmission({ ...submission, title: "CV reprovado" });

    await processGeneration(r.generationId!, {
      ...realServices,
      generate,
      renderArtifacts,
    });

    expect((await getVacancy(r.vacancy.id)).generations[0].state).toBe(
      "needs_review",
    );

    expect(renderArtifacts).not.toHaveBeenCalled();
    await request(app)
      .get(`/api/generations/${r.generationId}/pdf`)
      .expect(404);
  });
});

describe("Incremental correction and deletion", () => {
  async function pending(title: string) {
    const profile = await loadProfile();
    const draft = {
      summary: "Desenvolvedor com expertise em aplicações React.",
      summaryEvidenceIds: ["k1"],
      skills: ["React"],
      experiences: [
        {
          sourceId: "beacon",
          bullets: [
            { text: "Desenvolveu aplicações com React.", evidenceIds: ["k1"] },
          ],
        },
      ],
    };
    const review = {
      approved: false,
      issues: [
        {
          severity: "blocking",
          section: "Evidence",
          problem: "expertise sem suporte no resumo",
          fix: "Troque expertise por experiência, mantendo as entregas de k1.",
        },
      ],
      strengths: [],
      missingRequirements: [],
      questionsForCandidate: [],
    };
    const r = await createSubmission({ ...submission, title });

    await pool.query(
      "UPDATE generations SET state='needs_review',draft=$2,review=$3,profile_snapshot=$4,vacancy_snapshot=$5,tailoring=$6 WHERE id=$1",
      [
        r.generationId,
        JSON.stringify(draft),
        JSON.stringify(review),
        JSON.stringify(profile),
        JSON.stringify({ ...submission, title }),
        JSON.stringify(selection),
      ],
    );

    return { ...r, profile, draft, review };
  }

  it("resumes the selected version with feedback without rewriting unrelated bullets", async () => {
    const base = await pending("Correction incremental");
    const [one, two] = await Promise.all([
      request(app)
        .post(`/api/jobs/${base.vacancy.id}/repair`)
        .send({ generationId: base.generationId }),
      request(app)
        .post(`/api/jobs/${base.vacancy.id}/repair`)
        .send({ generationId: base.generationId }),
    ]);

    expect(one.status).toBe(202);
    expect(two.body.generationId).toBe(one.body.generationId);
    const loadProfile = vi.fn(),
      extractUrl = vi.fn(),
      writeDraft = vi.fn();
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        summary: {
          text: "Desenvolvedor com experiência em aplicações React.",
          evidenceIds: ["k1"],
        },
        skills: null,
        edits: [],
        orders: [],
      })
      .mockResolvedValueOnce({ ...base.review, approved: true, issues: [] });
    const renderArtifacts = vi.fn(async () => ({
      pdf: "test.pdf",
      docx: "test.docx",
    }));

    await processGeneration(one.body.generationId, {
      ...productionServices,
      loadProfile,
      extractUrl,
      writeDraft,
      generate,
      renderArtifacts,
    });

    const row = (
      await pool.query("SELECT * FROM generations WHERE id=$1", [
        one.body.generationId,
      ])
    ).rows[0];

    expect(row.state).toBe("ready");
    expect(row.repair_of).toBe(base.generationId);
    expect(row.draft.experiences).toEqual(base.draft.experiences);
    expect(row.profile_snapshot).toEqual(base.profile);
    expect(row.draft.summary).not.toContain("expertise");
    expect(generate.mock.calls[0][1]).toContain(base.review.issues[0].fix);
    expect(generate.mock.calls[0][1]).toContain(base.draft.summary);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(writeDraft).not.toHaveBeenCalled();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(extractUrl).not.toHaveBeenCalled();
    const original = (
      await pool.query("SELECT draft,state FROM generations WHERE id=$1", [
        base.generationId,
      ])
    ).rows[0];

    expect(original.draft).toEqual(base.draft);
    expect(original.state).toBe("needs_review");
  });

  it("blocks invented contributions despite a positive model review", async () => {
    const base = await pending("Correction infiel");

    base.review.issues.push({
      severity: "blocking",
      section: "Beacon",
      problem: "Rever a tecnologia de k1",
      fix: "Preserve apenas React em k1.",
    });

    await pool.query("UPDATE generations SET review=$2 WHERE id=$1", [
      base.generationId,
      JSON.stringify(base.review),
    ]);

    const id = await requestRepair(base.vacancy.id, base.generationId!);
    const patch = {
      summary: null,
      skills: null,
      edits: [
        {
          sourceId: "beacon",
          bulletIndex: 0,
          text: "Criou aplicações com React e NestJS.",
          evidenceIds: ["k1"],
        },
      ],
      orders: [],
    };
    const generate = vi.fn(async (_model, _prompt, schema: any) =>
      schema.shape.approved
        ? { ...base.review, approved: true, issues: [] }
        : patch,
    );
    const renderArtifacts = vi.fn();

    await processGeneration(id, {
      ...productionServices,
      generate,
      renderArtifacts,
    });

    const row = (await getVacancy(base.vacancy.id)).generations[0];

    expect(row.state).toBe("needs_review");
    expect(
      row.review.issues.some((i: any) => i.problem.includes("NestJS")),
    ).toBe(true);

    expect(renderArtifacts).not.toHaveBeenCalled();
    await request(app).get(`/api/generations/${id}/pdf`).expect(404);
  });

  it("does not approve empty repairs with remaining blockers", async () => {
    const base = await pending("Correction vazia"),
      id = await requestRepair(base.vacancy.id, base.generationId!);
    const generate = vi.fn().mockResolvedValue({
        summary: null,
        skills: null,
        edits: [],
        orders: [],
      }),
      renderArtifacts = vi.fn();

    await processGeneration(id, {
      ...productionServices,
      generate,
      renderArtifacts,
    });

    expect((await getVacancy(base.vacancy.id)).generations[0].state).toBe(
      "needs_review",
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(renderArtifacts).not.toHaveBeenCalled();
  });

  it("preserves the draft when edits exceed the allowed scope", async () => {
    const base = await pending("Correction fora do escopo"),
      id = await requestRepair(base.vacancy.id, base.generationId!);
    const generate = vi.fn().mockResolvedValue({
      summary: null,
      skills: null,
      edits: [
        {
          sourceId: "beacon",
          bulletIndex: 0,
          text: "Alteração não solicitada na experiência.",
          evidenceIds: ["k1"],
        },
      ],
      orders: [],
    });

    await processGeneration(id, {
      ...productionServices,
      generate,
      renderArtifacts: vi.fn(),
    });

    const row = (
      await pool.query("SELECT * FROM generations WHERE id=$1", [id])
    ).rows[0];

    expect(row.state).toBe("needs_review");
    expect(row.draft).toEqual(base.draft);
    expect((await getVacancy(base.vacancy.id)).generations[0].can_repair).toBe(
      true,
    );

    expect(row.review.issues.at(-1).problem).toContain(
      "previous draft was preserved",
    );
  });

  it("rejects another job's version, missing data and changed descriptions", async () => {
    const base = await pending("Origem da correção"),
      other = await pending("Outra origem");

    await request(app)
      .post(`/api/jobs/${other.vacancy.id}/repair`)
      .send({ generationId: base.generationId })
      .expect(422);

    await pool.query("UPDATE vacancies SET description=$2 WHERE id=$1", [
      base.vacancy.id,
      description + " Atualizada.",
    ]);

    const stale = await request(app)
      .post(`/api/jobs/${base.vacancy.id}/repair`)
      .send({ generationId: base.generationId })
      .expect(422);

    expect(stale.body.error).toContain("edited");
    await pool.query("UPDATE generations SET draft=NULL WHERE id=$1", [
      other.generationId,
    ]);

    await request(app)
      .post(`/api/jobs/${other.vacancy.id}/repair`)
      .send({ generationId: other.generationId })
      .expect(422);

    expect((await getVacancy(other.vacancy.id)).generations[0].can_repair).toBe(
      false,
    );
  });

  it("deletes only the selected job and its versions, queue items, notifications and files", async () => {
    const { writeFile, access, rm, mkdir } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const base = await pending("Excluir vaga de teste"),
      other = await pending("Preservar outra vaga");
    const correction = await requestRepair(base.vacancy.id, base.generationId!);

    await pool.query(
      "UPDATE generations SET state='needs_review' WHERE id=$1",
      [correction],
    );

    await pool.query(
      "INSERT INTO telegram_outbox(dedup_key,chat_id,text,generation_id) VALUES($1,$2,$3,$4)",
      ["delete-fixture", "test", "Notificação da fixture", base.generationId],
    );

    const paths = ["pdf", "docx"].map((ext) =>
      resolve(env.artifactDir, `${base.generationId}.${ext}`),
    );

    try {
      await mkdir(env.artifactDir, { recursive: true });

      for (const path of paths)
        await writeFile(path, "disposable fixture", { flag: "wx" });
      await request(app)
        .delete(`/api/jobs/${base.vacancy.id}`)
        .expect(200, { deleted: true, cleanupPending: false });

      expect(await getVacancy(base.vacancy.id)).toBeUndefined();
      expect(await getVacancy(other.vacancy.id)).toBeDefined();
      expect(
        (
          await pool.query("SELECT id FROM generations WHERE vacancy_id=$1", [
            base.vacancy.id,
          ])
        ).rowCount,
      ).toBe(0);

      expect(
        (
          await pool.query(
            "SELECT id FROM pgboss.job WHERE id=ANY($1::uuid[])",
            [[base.generationId, correction]],
          )
        ).rowCount,
      ).toBe(0);

      expect(
        (
          await pool.query(
            "SELECT id FROM telegram_outbox WHERE generation_id=$1",
            [base.generationId],
          )
        ).rowCount,
      ).toBe(0);

      for (const path of paths) await expect(access(path)).rejects.toThrow();
      await request(app)
        .get(`/api/generations/${base.generationId}/pdf`)
        .expect(404);
    } finally {
      for (const path of paths) await rm(path, { force: true });
    }
  });

  it("does not delete jobs during processing", async () => {
    const r = await createSubmission({
      ...submission,
      title: "Não excluir em processamento",
    });

    await request(app).delete(`/api/jobs/${r.vacancy.id}`).expect(422);
    expect(await getVacancy(r.vacancy.id)).toBeDefined();
  });
});

describe("API and application management", () => {
  it("accepts input, rejects short text and disallows external origins", async () => {
    await request(app)
      .post("/api/jobs")
      .send({ description: "curta" })
      .expect(400);

    await request(app)
      .post("/api/jobs")
      .set("Origin", "https://evil.example")
      .send(submission)
      .expect(403);

    const r = await request(app)
      .post("/api/jobs")
      .send({ ...submission, title: "API test" })
      .expect(202);

    expect(r.body.generationId).toBeTruthy();
  });

  it("records dates, clears applications and rejects future dates", async () => {
    const r = await createSubmission({ ...submission, title: "Candidatura" });
    const path = `/api/jobs/${r.vacancy.id}/application`;

    await request(app)
      .patch(path)
      .send({ appliedAt: "2026-01-01T12:00:00-03:00" })
      .expect(200);

    expect((await getVacancy(r.vacancy.id)).applied_at).toBeTruthy();
    await request(app)
      .patch(path)
      .send({ appliedAt: "2099-01-01T00:00:00Z" })
      .expect(422);

    await request(app).patch(path).send({ appliedAt: null }).expect(200);
    expect((await getVacancy(r.vacancy.id)).applied_at).toBeNull();
  });

  it("editing and new versions preserve the previous CV", async () => {
    const r = await createSubmission({ ...submission, title: "Editar" });

    await request(app)
      .patch(`/api/jobs/${r.vacancy.id}`)
      .send({ ...submission, title: "Novo título" })
      .expect(422);

    await pool.query("UPDATE generations SET state='needs_input' WHERE id=$1", [
      r.generationId,
    ]);

    await request(app)
      .patch(`/api/jobs/${r.vacancy.id}`)
      .send({ ...submission, title: "Novo título" })
      .expect(200);

    await request(app).post(`/api/jobs/${r.vacancy.id}/generate`).expect(202);
    expect((await getVacancy(r.vacancy.id)).generations).toHaveLength(2);
  });
});

describe("Offline Telegram and commands", () => {
  it("persists commands and offsets, deduplicates updates and ignores other chats", async () => {
    const update = {
      update_id: 800001,
      message: {
        chat: { id: Number(env.telegramChat) },
        text: `/job ${description} Teste Telegram`,
        date: 1700000000,
      },
    };

    await receiveUpdate(update);
    await receiveUpdate(update);
    expect(
      (
        await pool.query(
          "SELECT * FROM telegram_updates WHERE update_id=800001",
        )
      ).rowCount,
    ).toBe(1);

    expect(
      (
        await pool.query(
          "SELECT * FROM telegram_outbox WHERE dedup_key='reply:800001'",
        )
      ).rowCount,
    ).toBe(1);

    expect(
      (
        await pool.query(
          "SELECT value FROM app_state WHERE key='telegram_offset'",
        )
      ).rows[0].value,
    ).toBe("800002");

    await receiveUpdate({
      update_id: 800002,
      message: { chat: { id: 1 }, text: "/job " + description },
    });

    expect(
      (
        await pool.query(
          "SELECT * FROM telegram_outbox WHERE dedup_key='reply:800002'",
        )
      ).rowCount,
    ).toBe(0);
  });

  it("invalid commands do not interrupt later commands", async () => {
    await receiveUpdate({
      update_id: 800003,
      message: { chat: { id: Number(env.telegramChat) }, text: "/job" },
    });

    expect(
      (
        await pool.query(
          "SELECT text FROM telegram_outbox WHERE dedup_key='reply:800003'",
        )
      ).rows[0].text,
    ).toContain("Send the public URL");
  });

  it("lists jobs, edits descriptions, generates CVs and manages application dates", async () => {
    const item = await createSubmission({
      ...submission,
      title: "Comandos Telegram",
    });

    await pool.query("UPDATE generations SET state='needs_input' WHERE id=$1", [
      item.generationId,
    ]);

    const id = item.vacancy.id.slice(0, 8);
    let updateId = 800010;
    const command = async (text: string) => {
      const n = updateId++;

      await receiveUpdate({
        update_id: n,
        message: { chat: { id: Number(env.telegramChat) }, text },
      });

      return (
        await pool.query(
          "SELECT text FROM telegram_outbox WHERE dedup_key=$1",
          [`reply:${n}`],
        )
      ).rows[0].text as string;
    };

    expect(await command("/jobs")).toContain("My jobs");
    expect(await command(`/status ${id}`)).toContain("Awaiting description");
    expect(await command(`/description ${id} ${description}`)).toContain(
      "Description saved",
    );

    expect(await command(`/generate ${id}`)).toContain("Generation queued");
    expect((await getVacancy(item.vacancy.id)).generations).toHaveLength(2);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());

    expect(await command(`/applied ${id} ${today}`)).toContain(
      "Application recorded",
    );

    expect(await command(`/applied ${id} 2026-02-30`)).toContain("valid date");

    expect(await command(`/unapplied ${id}`)).toContain("removed");
    expect((await getVacancy(item.vacancy.id)).applied_at).toBeNull();
    expect(await command(`/download ${id}`)).toContain("No approved CV");
    expect(await command("/inexistente")).toContain("Unknown command");
  });

  it("reschedules delivery failures without losing the response", async () => {
    await pool.query("UPDATE telegram_outbox SET sent_at=now()");
    await receiveUpdate({
      update_id: 800050,
      message: { chat: { id: Number(env.telegramChat) }, text: "/help" },
    });

    const mock = vi.fn().mockRejectedValue(new Error("Offline"));

    vi.stubGlobal("fetch", mock);

    try {
      await deliverOutbox();
      const item = (
        await pool.query(
          "SELECT * FROM telegram_outbox WHERE dedup_key='reply:800050'",
        )
      ).rows[0];

      expect(item.sent_at).toBeNull();
      expect(item.attempts).toBe(1);
      await pool.query(
        "UPDATE telegram_outbox SET next_attempt_at=now() WHERE id=$1",
        [item.id],
      );

      mock.mockResolvedValue(
        Response.json({ ok: true, result: { message_id: 1 } }),
      );

      await deliverOutbox();
      expect(
        (
          await pool.query("SELECT sent_at FROM telegram_outbox WHERE id=$1", [
            item.id,
          ])
        ).rows[0].sent_at,
      ).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Crash recovery", () => {
  it("resumes interrupted work while preserving its version", async () => {
    const item = await createSubmission({
      ...submission,
      title: "Recuperação",
    });

    await pool.query(
      "UPDATE pgboss.job SET state='active',started_on=now() WHERE id=$1",
      [item.generationId],
    );

    await pool.query("UPDATE generations SET state='generating' WHERE id=$1", [
      item.generationId,
    ]);

    expect(await recoverInterruptedJobs()).toBe(1);
    expect(
      (
        await pool.query("SELECT state FROM pgboss.job WHERE id=$1", [
          item.generationId,
        ])
      ).rows[0].state,
    ).toBe("retry");

    const record = await getVacancy(item.vacancy.id);

    expect(record.generations).toHaveLength(1);
    expect(record.generations[0].state).toBe("queued");
    expect(await recoverInterruptedJobs()).toBe(0);
  });
});

describe("Gemini generation routing", () => {
  it("uses the compact service and persists a rejected draft without rendering", async () => {
    const previousProvider = env.cvProvider;

    env.cvProvider = "gemini";

    try {
      const created = await createSubmission({
        ...submission,
        title: "Gemini integration test",
      });
      const generation = (
        await pool.query(
          "SELECT id FROM generations WHERE vacancy_id=$1 ORDER BY created_at DESC LIMIT 1",
          [created.vacancy.id],
        )
      ).rows[0];
      const profile = await loadProfile();
      const draft = {
        summary: "Desenvolvedor com experiência em interfaces React.",
        summaryEvidenceIds: ["l1"],
        skills: ["React"],
        experiences: [
          {
            sourceId: "atlas",
            bullets: [
              { text: "Desenvolveu interfaces React.", evidenceIds: ["l1"] },
            ],
          },
        ],
      };
      const review = {
        approved: false,
        issues: [
          {
            severity: "blocking" as const,
            section: "Resumo",
            problem: "Revisar conteúdo",
            fix: "Conferir fatos",
          },
        ],
        strengths: [],
        missingRequirements: [],
        questionsForCandidate: [],
      };
      const render = vi.fn();
      const ollama = vi.fn();
      const run = vi.fn(
        async (_infer: any, _profile: any, _job: any, options: any) => {
          await options.onCheckpoint({
            round: 0,
            stage: "reviewing",
            draft,
            selection,
            review,
          });

          return {
            draft,
            selection,
            review,
            rounds: 3,
            calls: 6,
            promptVersion: "test",
            cv: assembleCv(draft, profile, "pt-BR"),
          };
        },
      );

      await processGeneration(generation.id, {
        ...actualServices,
        loadProfile: async () => profile,
        generate: ollama,
        renderArtifacts: render,
        runGeminiCv: run,
      });

      const saved = (
        await pool.query("SELECT * FROM generations WHERE id=$1", [
          generation.id,
        ])
      ).rows[0];

      expect(run).toHaveBeenCalledOnce();
      expect(ollama).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(saved.state).toBe("needs_review");
      expect(saved.draft).toEqual(draft);
      expect(saved.model).toContain(env.geminiModel);
    } finally {
      env.cvProvider = previousProvider;
    }
  });
});

describe("Named downloads and versions", () => {
  it("uses snapshots and consistent versions in the browser and Telegram", async () => {
    const { writeFile, mkdir, rm } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const { approvedDownload } = await import(
      "../src/repositories/downloads.repository.js"
    );
    const { outbox } = await import("../src/services/jobs.service.js");
    const item = await createSubmission({
      ...submission,
      title: "Full Stack",
      company: "ExampleCo",
    });
    const snapshot = { title: "Full Stack", company: "ExampleCo" };
    const ids = [item.generationId!];
    const paths: string[] = [];
    const approve = async (id: string) => {
      await pool.query(
        "UPDATE generations SET state='ready', cv=$2, profile_snapshot=$3, vacancy_snapshot=$4, pdf_path=$5, docx_path=$6 WHERE id=$1",
        [
          id,
          JSON.stringify({ name: "Nome Sobrenome" }),
          JSON.stringify({ name: "Nome Sobrenome" }),
          JSON.stringify(snapshot),
          id + ".pdf",
          id + ".docx",
        ],
      );

      await mkdir(env.artifactDir, { recursive: true });

      for (const ext of ["pdf", "docx"]) {
        const path = resolve(env.artifactDir, id + "." + ext);

        await writeFile(path, "test-download", { flag: "wx" });
        paths.push(path);
      }
    };

    try {
      await approve(ids[0]);
      ids.push(await requestGeneration(item.vacancy.id));
      await approve(ids[1]);
      await pool.query(
        "UPDATE vacancies SET title='Outro cargo',company='Outra empresa' WHERE id=$1",
        [item.vacancy.id],
      );

      expect((await approvedDownload(ids[0], "pdf"))?.filename).toBe(
        "Nome_Sobrenome_Fullstack_ExampleCo.pdf",
      );

      const response = await request(app)
        .get(`/api/generations/${ids[1]}/docx`)
        .expect(200);

      expect(response.headers["content-disposition"]).toContain(
        "Nome_Sobrenome_Fullstack_ExampleCo_v2.docx",
      );

      await pool.query("UPDATE telegram_outbox SET sent_at=now()");
      await outbox(pool, "download-test", "900001", "CV de teste", ids[1]);
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      });

      vi.stubGlobal("fetch", fetcher);
      await deliverOutbox();
      const forms = fetcher.mock.calls
        .map((call) => call[1].body)
        .filter((body) => body instanceof FormData);

      expect(forms.map((form) => (form.get("document") as File).name)).toEqual([
        "Nome_Sobrenome_Fullstack_ExampleCo_v2.pdf",
        "Nome_Sobrenome_Fullstack_ExampleCo_v2.docx",
      ]);

      await pool.query(
        "UPDATE generations SET pdf_path='../../private.pdf' WHERE id=$1",
        [ids[1]],
      );

      await request(app).get(`/api/generations/${ids[1]}/pdf`).expect(404);
    } finally {
      vi.unstubAllGlobals();

      for (const path of paths) await rm(path, { force: true });
    }
  });
});
