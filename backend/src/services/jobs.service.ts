import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/config.js";
import { submissionSchema, type Submission } from "../domain/types.js";
import { pool, transaction, type DB } from "../infrastructure/database/db.js";
import { canonicalUrl } from "../infrastructure/importer/importer.js";
import { enqueue, queueName } from "../infrastructure/queue/queue.js";
import { PROMPT_VERSION } from "../prompts/prompts.js";
import * as queries from "../repositories/jobs.repository.js";

export async function createSubmission(
  input: Submission,
  options: { db?: DB; chatId?: string; receivedAt?: Date } = {},
) {
  const data = submissionSchema.parse(input);
  const url = data.url ? canonicalUrl(data.url) : null;
  const key =
    url ??
    "text:" +
      createHash("sha256")
        .update([data.title, data.company, data.description].join("\n"))
        .digest("hex");
  const run = async (db: DB) => {
    const id = randomUUID();
    const inserted = await queries.insertVacancy(
      [
        id,
        data.title ||
          data.description.split("\n")[0].slice(0, 120) ||
          "Imported job",
        data.company,
        url,
        key,
        data.description,
        options.chatId ? "telegram" : "web",
        data.language,
        options.receivedAt ?? new Date(),
      ],
      db,
    );
    const vacancy =
      inserted.rows[0] ?? (await queries.findByCanonicalKey([key], db)).rows[0];

    if (!inserted.rowCount)
      return { vacancy, generationId: null, duplicate: true };
    const generationId = await requestGeneration(
      vacancy.id,
      options.chatId,
      db,
    );

    return { vacancy, generationId, duplicate: false };
  };

  return options.db ? run(options.db) : transaction(run);
}

export async function requestGeneration(
  vacancyId: string,
  chatId?: string,
  db?: DB,
): Promise<string> {
  const run = async (conn: DB) => {
    const vacancy = (await queries.lockVacancy([vacancyId], conn)).rows[0];

    if (!vacancy) throw new Error("Job not found.");
    const active = (await queries.findActiveGeneration([vacancyId], conn))
      .rows[0];

    if (active) {
      if (chatId) await queries.setGenerationChat([active.id, chatId], conn);

      return active.id;
    }

    const id = randomUUID();

    await queries.insertGeneration(
      [id, vacancyId, chatId ?? null, PROMPT_VERSION],
      conn,
    );

    await enqueue(conn, id);

    return id;
  };

  return db ? run(db) : transaction(run);
}

export async function listVacancies() {
  return (await queries.listVacancies([], pool)).rows;
}

export async function requestRepair(vacancyId: string, generationId: string) {
  return transaction(async (db) => {
    const vacancy = (await queries.lockRepairVacancy([vacancyId], db)).rows[0];

    if (!vacancy) throw new Error("Job not found.");
    const base = (await queries.findRepairBase([generationId, vacancyId], db))
      .rows[0];

    if (
      !base ||
      base.state !== "needs_review" ||
      !base.draft ||
      !base.review?.issues?.length ||
      !base.profile_snapshot ||
      !base.vacancy_snapshot ||
      !base.tailoring
    )
      throw new Error(
        "This version has no draft and feedback available for correction.",
      );
    const active = (await queries.findActiveRepair([vacancyId], db)).rows[0];

    if (active) {
      if (active.repair_of === generationId) return active.id;

      throw new Error("Wait for current processing to finish.");
    }

    if (
      ["title", "company", "description", "language"].some(
        (key) => vacancy[key] !== base.vacancy_snapshot[key],
      )
    )
      throw new Error(
        "The job was edited after this version. Generate a new version using the current description.",
      );
    const id = randomUUID();

    await queries.insertRepair(
      [
        id,
        vacancyId,
        PROMPT_VERSION,
        generationId,
        JSON.stringify(base.profile_snapshot),
        JSON.stringify(base.vacancy_snapshot),
        JSON.stringify(base.draft),
        JSON.stringify(base.review),
        JSON.stringify(base.tailoring),
      ],
      db,
    );

    await enqueue(db, id);

    return id;
  });
}

export async function deleteVacancy(vacancyId: string) {
  const ids = await transaction(async (db) => {
    const vacancy = (await queries.lockDeletedVacancy([vacancyId], db)).rows[0];

    if (!vacancy) throw new Error("Job not found.");
    const generations = (await queries.listGenerationStates([vacancyId], db))
      .rows;

    if (
      generations.some((g) =>
        ["queued", "importing", "generating", "reviewing"].includes(g.state),
      )
    )
      throw new Error("Wait for processing to finish before deleting the job.");
    const ids = generations.map((g) => g.id);
    const running = await queries.findActiveQueueJobs([queueName, ids], db);

    if (running.rowCount)
      throw new Error(
        "The worker is finalizing this job. Wait a few seconds and retry.",
      );
    await queries.deleteOutbox([ids], db);
    await queries.deleteQueuedJobs([queueName, ids], db);
    await queries.deleteGenerations([vacancyId], db);
    await queries.deleteVacancyRow([vacancyId], db);

    return ids;
  });
  let cleanupPending = false;

  for (const id of ids)
    for (const format of ["pdf", "docx"]) {
      // UUIDs come from the DB, never from a stored artifact path or a user filename.
      try {
        await rm(resolve(env.artifactDir, `${id}.${format}`), { force: true });
      } catch {
        cleanupPending = true;
      }
    }

  return { deleted: true, cleanupPending };
}

export async function getVacancy(id: string) {
  const vacancy = (await queries.findVacancy([id], pool)).rows[0];

  if (!vacancy) return undefined;
  const generations = (await queries.listGenerationDetails([id], pool)).rows;

  return { ...vacancy, generations };
}

export async function outbox(
  db: DB,
  key: string,
  chat: string,
  text: string,
  generationId?: string,
  markup?: unknown,
) {
  await queries.insertOutbox(
    [
      key,
      chat,
      text,
      generationId ?? null,
      markup ? JSON.stringify(markup) : null,
    ],
    db,
  );
}

export async function resolveVacancyId(prefix: string, db: DB = pool) {
  if (!/^[a-f0-9-]{6,36}$/i.test(prefix))
    throw new Error("Use the job ID shown in the list.");
  const rows = (await queries.findVacancyIds([prefix + "%"], db)).rows;

  if (rows.length !== 1)
    throw new Error(
      rows.length ? "Ambiguous ID. Use more characters." : "Job not found.",
    );

  return rows[0].id as string;
}
