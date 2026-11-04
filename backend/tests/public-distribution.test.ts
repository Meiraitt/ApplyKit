import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { toJSONSchema } from "zod";
import { profileSchema } from "../src/domain/types.js";
import {
  evidenceCases,
  codexWriterSchema,
  codexTechnologyOptions,
  codexWriterPrompt,
} from "../src/prompts/codex-prompts.js";
import { actionableReviewSchema } from "../src/domain/cv/review-coverage.js";
import {
  createCodexClient,
  codexFailureDetail,
} from "../src/infrastructure/providers/codex-client.js";

const profile = profileSchema.parse({
  name: "Test Candidate",
  headline: "Developer",
  contact: {},
  summary: "",
  skills: ["React"],
  education: ["Example College"],
  languages: [],
  experiences: [
    {
      id: "arbitrary-employer",
      company: "Fictional Company",
      role: "Developer",
      period: "2024",
      facts: [
        {
          id: "arbitrary-fact",
          text: "Led a release, prioritized fixes and communicated progress to the client.",
        },
      ],
    },
  ],
});

describe("public distribution contracts", () => {
  it("uses each installation's profile without inheriting another candidate's evidence", () => {
    const first = structuredClone(profile);
    const second = structuredClone(profile);

    first.skills = ["Python", "Django"];
    first.experiences[0].id = "library-service";
    first.experiences[0].facts = [
      {
        id: "catalog-search",
        text: "Implemented catalog search with Python and Django.",
      },
    ];

    second.skills = ["Go"];
    second.experiences[0].id = "weather-service";
    second.experiences[0].facts = [
      { id: "forecast-cache", text: "Implemented a forecast cache with Go." },
    ];

    const job = {
      title: "Backend Developer",
      description: "Build backend services and maintain documented APIs.",
      language: "en" as const,
    };
    const firstPrompt = codexWriterPrompt(first, job);
    const secondPrompt = codexWriterPrompt(second, job);

    expect(codexTechnologyOptions(first)).toEqual({
      "library-service": ["Python", "Django"],
    });

    expect(codexTechnologyOptions(second)).toEqual({
      "weather-service": ["Go"],
    });

    expect(firstPrompt).toContain("catalog-search");
    expect(firstPrompt).not.toContain("forecast-cache");
    expect(secondPrompt).toContain("forecast-cache");
    expect(secondPrompt).not.toContain("catalog-search");
    expect(secondPrompt).not.toContain("Python");
  });

  it("derives evidence cases from content rather than private fact IDs", () => {
    expect(
      evidenceCases(profile).find((c) => c.id === "release-ownership"),
    ).toMatchObject({
      sourceId: "arbitrary-employer",
      evidenceIds: ["arbitrary-fact"],
    });

    const unrelated = structuredClone(profile);

    unrelated.experiences[0].facts = [
      { id: "k25", text: "Implemented a React component." },
    ];

    expect(
      evidenceCases(unrelated).some((c) => c.id === "release-ownership"),
    ).toBe(false);
  });

  it("sends closed output objects for both actual CLI response contracts", async () => {
    for (const schema of [codexWriterSchema(profile), actionableReviewSchema]) {
      const infer = createCodexClient({
        execute: async (invocation) => {
          const file =
            invocation.args[invocation.args.indexOf("--output-schema") + 1];
          const wire = JSON.parse(await readFile(file, "utf8"));
          const objects: Record<string, unknown>[] = [];

          function visit(value: unknown) {
            if (!value || typeof value !== "object") return;

            if (!Array.isArray(value) && (value as any).type === "object")
              objects.push(value as any);
            Object.values(value).forEach(visit);
          }

          visit(wire);
          expect(objects.length).toBeGreaterThan(1);

          for (const object of objects) {
            expect(object.additionalProperties).toBe(false);
            expect(object.required).toEqual(
              Object.keys(object.properties as object),
            );
          }

          expect(wire).toEqual(
            toJSONSchema(schema, { target: "draft-7", io: "output" }),
          );

          return {
            code: 1,
            stdout: JSON.stringify({
              type: "error",
              message: "synthetic schema check complete",
            }),
            stderr: "",
          };
        },
      });

      await expect(infer("writer", "synthetic input", schema)).rejects.toThrow(
        "synthetic schema check complete",
      );
    }
  });

  it("reports JSONL provider errors even with empty stderr without exposing progress content", () => {
    const stdout = [
      JSON.stringify({
        type: "item.completed",
        item: { text: "private source text" },
      }),
      JSON.stringify({
        type: "error",
        message: JSON.stringify({
          error: { message: "Invalid output schema" },
        }),
      }),
    ].join("\n");

    expect(codexFailureDetail(stdout, "")).toBe("Invalid output schema");
    expect(
      codexFailureDetail(
        JSON.stringify({
          type: "item.completed",
          item: { text: "private source text" },
        }),
        "",
      ),
    ).not.toContain("private source text");
  });
});
