import type { RequestHandler } from "express";
import { z } from "zod";
import { dashboard as getDashboard } from "../repositories/dashboard.repository.js";

const uuid = z.string().uuid();

export const dashboard: RequestHandler = async (req, res) =>
  res.json(
    await getDashboard(
      z.coerce
        .number()
        .int()
        .min(4)
        .max(12)
        .parse(req.query.weeks ?? 8),
    ),
  );
