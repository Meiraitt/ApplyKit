import { transaction } from "../infrastructure/database/db.js";
import * as queries from "../repositories/jobs.repository.js";

export type JobEdit = {
  title: string;
  company: string;
  description: string;
  language: "pt-BR" | "en";
};

export type ApplicationEdit = {
  appliedAt: string | null;
  generationId?: string | null;
};

export async function editVacancy(id: string, data: JobEdit) {
  await transaction(async (db) => {
    const job = (await queries.lockEditedVacancy([id], db)).rows[0];

    if (!job) throw new Error("Job not found.");
    const active = await queries.findEditingGeneration([id], db);

    if (active.rowCount)
      throw new Error("Wait for current generation to finish before editing.");
    await queries.updateVacancy(
      [id, data.title, data.company, data.description, data.language],
      db,
    );
  });
}

export async function setApplication(id: string, data: ApplicationEdit) {
  if (data.appliedAt && new Date(data.appliedAt).getTime() > Date.now() + 60000)
    throw new Error("The application date cannot be in the future.");

  if (data.generationId) {
    const g = (await queries.findApprovedGeneration([data.generationId, id]))
      .rows[0];

    if (!g)
      throw new Error(
        "CV does not belong to this job or has not been approved.",
      );
  }

  const result = await queries.updateApplication([
    id,
    data.appliedAt,
    data.appliedAt ? (data.generationId ?? null) : null,
  ]);

  return !!result.rowCount;
}
