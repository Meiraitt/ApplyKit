import { z } from "zod";

export const factSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  usage: z.enum(["delivery", "context"]).optional(),
  summary: z.string().min(1).optional(),
  summaryEn: z.string().min(1).optional(),
  cvText: z.string().min(1).optional(),
  cvTextEn: z.string().min(1).optional(),
  area: z
    .enum(["frontend", "backend", "fullstack", "quality", "general"])
    .optional(),
});

export const experienceSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  period: z.string(),
  kind: z.enum(["work", "project"]).default("work"),
  facts: z.array(factSchema).min(1),
});

export const profileSchema = z.object({
  name: z.string().min(1),
  headline: z.string(),
  contact: z.record(z.string(), z.string()),
  summary: z.string(),
  skills: z.array(z.string()),
  experiences: z.array(experienceSchema),
  education: z.array(z.string()),
  languages: z.array(z.string()),
  studies: z.array(z.string()).optional(),
  notes: z.string().default(""),
});

export type Profile = z.infer<typeof profileSchema>;

export const draftSchema = z.object({
  summary: z.string().min(30).max(1000),
  summaryEvidenceIds: z.array(z.string()).optional(),
  skills: z.array(z.string()).max(24),
  experiences: z
    .array(
      z.object({
        sourceId: z.string(),
        bullets: z
          .array(
            z.object({
              text: z.string().min(15).max(650),
              evidenceIds: z.array(z.string()).min(1),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1),
});

export const presentationSchema = z.object({
  educationIndices: z.array(z.number().int().nonnegative()),
  technologySelections: z.array(
    z.object({
      sourceId: z.string(),
      technologies: z.array(z.string()).max(8),
    }),
  ),
});

export type Draft = z.infer<typeof draftSchema> & {
  presentation?: z.infer<typeof presentationSchema>;
};

export function draftSchemaFor(profile: Profile, complete = false) {
  const choices = (values: string[]) => z.enum(values as [string, ...string[]]);

  if (!profile.skills.length || !profile.experiences.length)
    throw new Error("Fill in profile skills and experiences.");
  const variants = profile.experiences.map((e) => {
    const internship = /intern|estagi/i.test(e.role);

    return z.object({
      sourceId: z.literal(e.id),
      bullets: z
        .array(
          z.object({
            text: z.string().min(15).max(650),
            evidenceIds: z.array(choices(e.facts.map((f) => f.id))).min(1),
          }),
        )
        .min(complete && !internship ? Math.min(2, e.facts.length) : 1)
        .max(internship ? 2 : 4),
    });
  });
  const experience =
    variants.length === 1
      ? variants[0]
      : z.discriminatedUnion(
          "sourceId",
          variants as [
            (typeof variants)[number],
            (typeof variants)[number],
            ...(typeof variants)[number][],
          ],
        );

  return draftSchema.extend({
    presentation: presentationSchema.optional(),
    summaryEvidenceIds: z
      .array(
        choices(profile.experiences.flatMap((e) => e.facts.map((f) => f.id))),
      )
      .min(1),
    skills: z.array(choices(profile.skills)).max(10),
    experiences: z
      .array(experience)
      .min(complete ? profile.experiences.length : 1)
      .max(profile.experiences.length),
  });
}

export const bulletAuditSchema = z.object({
  sourceId: z.string(),
  bulletIndex: z.number().int().nonnegative(),
  decision: z.enum(["keep", "replace"]),
  reason: z.string().min(10),
  replacementEvidenceIds: z.array(z.string()),
});

export const reviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(["blocking", "suggestion"]),
      section: z.string(),
      problem: z.string(),
      fix: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  questionsForCandidate: z.array(z.string()),
  bulletAudit: z.array(bulletAuditSchema).optional(),
  artifactValidation: z
    .object({
      pages: z.number(),
      textVerified: z.boolean(),
      checkedBlocks: z.number(),
    })
    .optional(),
});

export type Review = z.infer<typeof reviewSchema>;

export type Cv = {
  layoutVersion?: "experience-first-v1";
  studies?: string[];
  name: string;
  headline: string;
  contact: Record<string, string>;
  summary: string;
  skills: string[];
  experiences: Array<{
    company: string;
    role: string;
    period: string;
    kind: "work" | "project";
    bullets: string[];
    technologies?: string[];
  }>;
  education: string[];
  languages: string[];
  language: "pt-BR" | "en";
};

export const submissionSchema = z
  .object({
    title: z.string().trim().max(200).default(""),
    company: z.string().trim().max(200).default(""),
    url: z.string().trim().max(2000).optional().or(z.literal("")),
    description: z.string().trim().max(40000).default(""),
    language: z.enum(["pt-BR", "en"]).default("pt-BR"),
  })
  .refine((v) => Boolean(v.url) || v.description.length >= 80, {
    message: "Enter a URL or a description of at least 80 characters.",
  });

export type Submission = z.infer<typeof submissionSchema>;
