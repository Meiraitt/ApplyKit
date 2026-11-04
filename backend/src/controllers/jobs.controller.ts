import type { RequestHandler } from "express";
import { z } from "zod";
import {
  editVacancy,
  setApplication as updateApplication,
} from "../services/job-edit.service.js";
import {
  createSubmission,
  deleteVacancy,
  getVacancy,
  listVacancies,
} from "../services/jobs.service.js";

const uuid = z.string().uuid();

export const listJobs: RequestHandler = async (_req, res) =>
  res.json(await listVacancies());

export const createJob: RequestHandler = async (req, res) =>
  res.status(202).json(await createSubmission(req.body));

export const getJob: RequestHandler = async (req, res) => {
  const v = await getVacancy(uuid.parse(req.params.id));

  if (!v) {
    res.status(404).json({ error: "Job not found." });

    return;
  }

  res.json(v);
};

export const editJob: RequestHandler = async (req, res) => {
  const id = uuid.parse(req.params.id);
  const data = z
    .object({
      title: z.string().trim().min(1).max(200),
      company: z.string().trim().max(200),
      description: z.string().trim().min(80).max(40000),
      language: z.enum(["pt-BR", "en"]),
    })
    .parse(req.body);

  await editVacancy(id, data);
  res.json(await getVacancy(id));
};

export const deleteJob: RequestHandler = async (req, res) =>
  res.json(await deleteVacancy(uuid.parse(req.params.id)));

export const setApplication: RequestHandler = async (req, res) => {
  const id = uuid.parse(req.params.id);
  const data = z
    .object({
      appliedAt: z.string().datetime({ offset: true }).nullable(),
      generationId: z.string().uuid().nullable().optional(),
    })
    .parse(req.body);

  if (!(await updateApplication(id, data))) {
    res.status(404).json({ error: "Job not found." });

    return;
  }

  res.json(await getVacancy(id));
};
