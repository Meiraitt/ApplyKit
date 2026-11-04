import { isDeepStrictEqual } from "node:util";
import { ZodError } from "zod";
import { env } from "../config/config.js";
import { providerConfigurationIssues } from "../config/provider-config.js";
import {
  assembleCv,
  validateEditorial,
  validateEvidence,
} from "../domain/cv/cv.js";
import {
  reconcileMissing,
  reconcileQuestions,
  tailoringPrompt,
  tailoringSchema,
  validateModelSelection,
  type Tailoring,
} from "../domain/cv/tailoring.js";
import { type Draft, type Review } from "../domain/types.js";
import { pool, transaction } from "../infrastructure/database/db.js";
import {
  PdfPageOverflow,
  renderArtifacts,
} from "../infrastructure/documents/render.js";
import {
  extractUrl,
  NeedsDescription,
} from "../infrastructure/importer/importer.js";
import { createClaudeClient } from "../infrastructure/providers/claude-client.js";
import { createCodexClient } from "../infrastructure/providers/codex-client.js";
import { createCompatibleClient } from "../infrastructure/providers/compatible-client.js";
import { createGeminiClient } from "../infrastructure/providers/gemini-client.js";
import { generate } from "../infrastructure/providers/llm.js";
import {
  summarizeUsage,
  trackInference,
  type TokenCall,
} from "../infrastructure/providers/token-usage.js";
import { jobButtons } from "../integrations/telegram/telegram-ui.js";
import { PROMPT_VERSION } from "../prompts/prompts.js";
import * as records from "../repositories/generations.repository.js";
import { outbox } from "../services/jobs.service.js";
import { CODEX_PROMPT_VERSION, runCodexCv } from "./cv/codex-flow.js";
import { GEMINI_PROMPT_VERSION, runGeminiCv } from "./cv/gemini-flow.js";
import { repairGroundedDraft } from "./cv/repair.js";
import { reviewGroundedDraft } from "./cv/reviewer.js";
import { writeGroundedDraft } from "./cv/writer.js";
import { loadProfile } from "./profile.service.js";

export const realServices = {
  loadProfile,
  extractUrl,
  generate,
  renderArtifacts,
  writeDraft: writeGroundedDraft,
  repairDraft: repairGroundedDraft,
  reviewDraft: reviewGroundedDraft,
  runGeminiCv,
  runCodexCv,
};

export async function processGeneration(id: string, services = realServices) {
  const started = Date.now();
  const record = (await records.findGeneration([id], pool)).rows[0];

  if (
    !record ||
    ["ready", "needs_input", "needs_review"].includes(record.state)
  )
    return;
  const job = (await records.findVacancy([record.vacancy_id], pool)).rows[0];
  const tokenCalls: TokenCall[] = record.token_usage?.calls ?? [];
  const saveUsage = async (call: TokenCall) => {
    tokenCalls.push(call);
    await records.saveUsage(
      [id, JSON.stringify(summarizeUsage(tokenCalls))],
      pool,
    );
  };
  const measuredGenerate = (role: "writer" | "reviewer") => {
    return async <T extends import("zod").ZodTypeAny>(
      model: string,
      prompt: string,
      schema: T,
    ): Promise<import("zod").infer<T>> => {
      const measured = trackInference(
        (_role, p, s) => services.generate(model, p, s),
        saveUsage,
      );

      return measured(role, prompt, schema);
    };
  };
  const writerGenerate = measuredGenerate("writer");
  const reviewerGenerate = measuredGenerate("reviewer");
  const stage = async (state: string) => {
    await records.setStage([id, state], pool);
  };

  try {
    const configurationIssues = providerConfigurationIssues(env);

    if (configurationIssues.length)
      throw new Error(configurationIssues.join(" "));

    if (
      !record.repair_of &&
      (!job.description || job.description.trim().length < 80)
    ) {
      await stage("importing");

      if (!job.url)
        throw new NeedsDescription(
          "Paste a description of at least 80 characters.",
        );
      const extracted = await services.extractUrl(job.url);

      job.description = extracted.description;

      if (job.title === "Imported job") job.title = extracted.title;

      if (!job.company) job.company = extracted.company;
      await records.saveImportedVacancy(
        [job.id, job.title, job.company, job.description],
        pool,
      );
    }

    const profile = record.profile_snapshot ?? (await services.loadProfile());
    const snapshot = record.vacancy_snapshot ?? {
      title: job.title,
      company: job.company,
      description: job.description,
      language: job.language,
    };

    await records.saveSnapshot(
      [
        id,
        JSON.stringify(profile),
        JSON.stringify(snapshot),
        env.cvProvider === "codex"
          ? `Codex CLI: ${env.codexModel ?? "default"}`
          : env.cvProvider === "claude"
            ? `Claude CLI: ${env.claudeModel ?? "default"}`
            : env.cvProvider === "compatible"
              ? `Chat Completions: ${env.compatibleModel}`
              : env.cvProvider === "gemini"
                ? `${env.geminiModel} / ${env.geminiModel}`
                : `${env.writerModel} / ${env.reviewerModel}`,
        ["codex", "claude", "compatible"].includes(env.cvProvider)
          ? CODEX_PROMPT_VERSION
          : env.cvProvider === "gemini"
            ? GEMINI_PROMPT_VERSION
            : PROMPT_VERSION,
      ],
      pool,
    );

    await stage("generating");
    let selection: Tailoring;
    let draft: Draft | undefined;
    let review: Review | undefined;

    if (["gemini", "codex", "claude", "compatible"].includes(env.cvProvider)) {
      if (record.repair_of && (!record.draft || !record.review))
        throw new Error(
          "The source version lacks the data required for correction.",
        );
      const infer =
        env.cvProvider === "codex"
          ? createCodexClient({
              executable: env.codexExecutable,
              model: env.codexModel,
            })
          : env.cvProvider === "claude"
            ? createClaudeClient({
                executable: env.claudeExecutable,
                model: env.claudeModel,
              })
            : env.cvProvider === "compatible"
              ? createCompatibleClient({
                  url: env.compatibleUrl,
                  model: env.compatibleModel,
                  writerKey: env.compatibleWriterKey,
                  reviewerKey: env.compatibleReviewerKey,
                  responseFormat: env.compatibleResponseFormat,
                })
              : createGeminiClient({
                  model: env.geminiModel,
                  writerKey: env.geminiWriterKey,
                  reviewerKey: env.geminiReviewerKey,
                });
      const result = await (
        env.cvProvider === "gemini" ? services.runGeminiCv : services.runCodexCv
      )(trackInference(infer, saveUsage), profile, snapshot, {
        previous: record.repair_of
          ? { draft: record.draft, review: record.review }
          : undefined,
        onCheckpoint: async (checkpoint) => {
          await stage(checkpoint.stage);

          if (checkpoint.draft)
            await records.saveCheckpoint(
              [
                id,
                JSON.stringify(checkpoint.draft),
                JSON.stringify(checkpoint.selection),
                checkpoint.review ? JSON.stringify(checkpoint.review) : null,
              ],
              pool,
            );
        },
      });

      ({ selection, draft, review } = result);
    } else {
      selection = record.repair_of
        ? record.tailoring
        : validateModelSelection(
            profile,
            await writerGenerate(
              env.writerModel,
              tailoringPrompt(profile, snapshot),
              tailoringSchema(profile),
            ),
            snapshot.description,
          );

      const focused = profile; // Writer and reviewer see omitted evidence too.

      if (!focused.experiences.length)
        throw new Error(
          "Selection found no valid evidence. Review the profile and generate again.",
        );
      await records.saveSelection([id, JSON.stringify(selection)], pool);
      draft = record.repair_of ? record.draft : undefined;
      review = record.repair_of ? record.review : undefined;

      if (record.repair_of && (!draft || !review || !selection))
        throw new Error(
          "The source version lacks the data required for correction.",
        );
      let approvedCandidate:
        | { draft: Draft; review: Review; selection: Tailoring }
        | undefined;

      for (let attempt = 0; attempt < 2; attempt++) {
        // The writer interprets reviewer feedback against the full profile; no canned replacement.
        await stage("generating");
        const beforeRepair = draft;

        try {
          draft = record.repair_of
            ? await services.repairDraft(
                writerGenerate,
                env.writerModel,
                focused,
                snapshot,
                review!,
                draft!,
              )
            : await services.writeDraft(
                writerGenerate,
                env.writerModel,
                focused,
                snapshot,
                review,
                draft,
                selection,
              );
        } catch (error) {
          if (approvedCandidate) {
            console.warn(
              "Optional rewrite unavailable; preserving the approved version.",
            );

            break;
          }

          if (
            record.repair_of &&
            draft &&
            review &&
            (error instanceof ZodError ||
              (error instanceof Error &&
                /estrutura inválida|A correção/.test(error.message)))
          ) {
            review = {
              ...review,
              approved: false,
              issues: [
                ...review.issues,
                {
                  severity: "blocking",
                  section: "Correction",
                  problem:
                    "Attempt rejected because the model violated edit scope or output format. The previous draft was preserved.",
                  fix: "Retry correction using the feedback. No invalid change was incorporated.",
                },
              ],
            };

            break;
          }

          throw error;
        }

        if (
          record.repair_of &&
          isDeepStrictEqual(beforeRepair, draft) &&
          review?.issues.some((i) => i.severity === "blocking")
        )
          break;

        if (record.repair_of)
          selection = {
            ...selection,
            priorities: draft.experiences.map((e) => ({
              sourceId: e.sourceId,
              evidenceIds: [
                ...new Set(e.bullets.flatMap((b) => b.evidenceIds)),
              ],
            })),
          };
        await stage("reviewing");

        try {
          review = await services.reviewDraft(
            reviewerGenerate,
            env.reviewerModel,
            focused,
            snapshot,
            draft,
            selection,
          );
        } catch (error) {
          if (approvedCandidate) {
            console.warn(
              "Optional review unavailable; preserving the approved version.",
            );

            break;
          }

          throw error;
        }

        review.missingRequirements = reconcileMissing(
          profile,
          selection,
          review.missingRequirements,
        );

        review.questionsForCandidate = reconcileQuestions(
          profile,
          review.questionsForCandidate,
          selection,
        );

        const evidenceIssues = validateEvidence(draft, profile);

        review.issues.push(
          ...evidenceIssues.map((problem) => ({
            severity: "blocking" as const,
            section: "Evidence",
            problem,
            fix: "Use only facts and references present in the profile.",
          })),
        );

        review.issues.push(
          ...validateEditorial(draft, snapshot.language).map((problem) => ({
            severity: "blocking" as const,
            section: problem.startsWith("Wrong language in ")
              ? problem.split(":")[0].replace("Wrong language in ", "")
              : "Resumo",
            problem,
            fix: "Preserve evidence, use the requested language and natural prose. The summary presents positioning and capabilities without concatenating bullets.",
          })),
        );

        review.approved =
          review.approved &&
          !review.issues.some((i) => i.severity === "blocking");

        await records.saveReviewedCandidate(
          [
            id,
            JSON.stringify(
              assembleCv(
                draft,
                profile,
                snapshot.language,
                snapshot.title,
                snapshot.description,
              ),
            ),
            JSON.stringify(review),
          ],
          pool,
        );

        if (review.approved) {
          approvedCandidate = { draft, review, selection };

          // One focused editorial revision is useful even when the facts already pass.
          if (!review.issues.some((i) => i.severity === "suggestion")) break;
        }
      }

      // A rejected rewrite must never replace a previously approved draft.
      if (approvedCandidate) {
        draft = approvedCandidate.draft;
        review = approvedCandidate.review;
        selection = approvedCandidate.selection;
      }
    }

    if (!draft || !review) throw new Error("No CV produced.");
    const cv = assembleCv(
      draft,
      profile,
      snapshot.language,
      snapshot.title,
      snapshot.description,
    );
    let files = null;

    if (review.approved) {
      try {
        files = await services.renderArtifacts(id, cv);
      } catch (error) {
        if (!(error instanceof PdfPageOverflow)) throw error;
        review.approved = false;
        review.issues.push({
          severity: "blocking",
          section: "PDF",
          problem: error.message,
          fix: "Shorten repetition and secondary details. Preserve central job evidence, facts and dates.",
        });
      }
    }

    if (files && "validation" in files)
      review.artifactValidation = files.validation;
    await transaction(async (db) => {
      await records.saveFinalSelection([id, JSON.stringify(selection)], db);
      await records.completeGeneration(
        [
          id,
          review!.approved ? "ready" : "needs_review",
          JSON.stringify(cv),
          JSON.stringify(review),
          files?.pdf ?? null,
          files?.docx ?? null,
          Date.now() - started,
          JSON.stringify(draft),
        ],
        db,
      );

      if (record.telegram_chat)
        await outbox(
          db,
          `result:${id}`,
          record.telegram_chat,
          review!.approved
            ? `CV ready: ${job.title}\nJob: ${job.id.slice(0, 8)}\nUse /aplicada ${job.id.slice(0, 8)} when submitting your application.`
            : `The review found issues requiring changes in ${job.title}. Open the job in the dashboard to see the report.`,
          review!.approved ? id : undefined,
          jobButtons(job.id, !!job.applied_at),
        );
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CV generation failed.";

    if (error instanceof NeedsDescription) {
      await transaction(async (db) => {
        await records.markNeedsInput([id, message], db);
        await records.saveExtractionError([job.id, message], db);

        if (record.telegram_chat)
          await outbox(
            db,
            `input:${id}`,
            record.telegram_chat,
            `${message}\nSend /description ${job.id.slice(0, 8)} followed by the job description, or tap Edit description.`,
            undefined,
            jobButtons(job.id, !!job.applied_at),
          );
      });

      return;
    }

    throw error;
  }
}
