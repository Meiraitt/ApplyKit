import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderArtifacts } from "/app/backend/dist/infrastructure/documents/render.js";

// A document fixture exercises the real renderer, not the AI approval pipeline.
const cv = {
  name: "Test Candidate",
  headline: "Frontend Developer",
  contact: { email: "candidate@example.com" },
  summary:
    "Frontend developer building accessible interfaces with React and TypeScript.",
  skills: ["React", "TypeScript"],
  experiences: [
    {
      company: "Fictional Test Company",
      role: "Developer",
      period: "01/2025 – 12/2025",
      kind: "work",
      bullets: [
        "Built React and TypeScript components for a registration form.",
        "Integrated the form with an existing REST API.",
      ],
    },
  ],
  education: ["Computer Science — Fictional Test College"],
  languages: ["English"],
  language: "en",
};
const result = await renderArtifacts("container-smoke", cv);

assert.equal(result.validation.pages, 1);
assert.equal(result.validation.textVerified, true);
assert.equal(
  (await readFile("/app/data/cvs/container-smoke.pdf"))
    .subarray(0, 4)
    .toString(),
  "%PDF",
);

assert.equal(
  (await readFile("/app/data/cvs/container-smoke.docx"))
    .subarray(0, 2)
    .toString(),
  "PK",
);

console.log(
  "Real Chromium PDF and DOCX rendering passed, with extractable text on one page.",
);
