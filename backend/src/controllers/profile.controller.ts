import type { RequestHandler } from "express";
import { z } from "zod";
import { loadProfile } from "../services/profile.service.js";

const uuid = z.string().uuid();

export const profile: RequestHandler = async (_req, res) => {
  const p = await loadProfile();

  res.json({ name: p.name, headline: p.headline, notes: p.notes });
};
