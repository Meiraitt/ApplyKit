import type { RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../infrastructure/database/db.js";

const uuid = z.string().uuid();

export const health: RequestHandler = async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
};
