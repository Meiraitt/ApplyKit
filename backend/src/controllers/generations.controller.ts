import type { RequestHandler } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/config.js";
import { approvedDownload } from "../repositories/downloads.repository.js";
import { requestGeneration, requestRepair } from "../services/jobs.service.js";

const uuid = z.string().uuid();

export const generateCv: RequestHandler = async (req, res) =>
  res.status(202).json({
    generationId: await requestGeneration(uuid.parse(req.params.id)),
  });

export const repairCv: RequestHandler = async (req, res) => {
  const body = z.object({ generationId: uuid }).strict().parse(req.body);

  res.status(202).json({
    generationId: await requestRepair(
      uuid.parse(req.params.id),
      body.generationId,
    ),
  });
};

export const download: RequestHandler = async (req, res) => {
  const id = uuid.parse(req.params.id);
  const format = z.enum(["pdf", "docx"]).parse(req.params.format);
  const download = await approvedDownload(id, format);
  const path = resolve(env.artifactDir, `${id}.${format}`);

  if (!download || !existsSync(path)) {
    res.status(404).json({ error: "Approved file unavailable." });

    return;
  }

  res.download(download.file, download.filename, { root: env.artifactDir });
};
