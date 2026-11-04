import { Router } from "express";
import * as dashboard from "../controllers/dashboard.controller.js";
import * as generations from "../controllers/generations.controller.js";
import * as health from "../controllers/health.controller.js";
import * as jobs from "../controllers/jobs.controller.js";
import * as profile from "../controllers/profile.controller.js";

export function apiRouter() {
  const router = Router();

  router.get("/health", health.health);
  router.get("/profile", profile.profile);
  router.get("/dashboard", dashboard.dashboard);
  router.get("/jobs", jobs.listJobs);
  router.post("/jobs", jobs.createJob);
  router.get("/jobs/:id", jobs.getJob);
  router.patch("/jobs/:id", jobs.editJob);
  router.post("/jobs/:id/generate", generations.generateCv);
  router.post("/jobs/:id/repair", generations.repairCv);
  router.delete("/jobs/:id", jobs.deleteJob);
  router.patch("/jobs/:id/application", jobs.setApplication);
  router.get("/generations/:id/:format", generations.download);

  return router;
}
