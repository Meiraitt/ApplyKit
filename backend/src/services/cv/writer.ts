import { z } from "zod";
import { validateEditorial, validateEvidence } from "../../domain/cv/cv.js";
import { targetsExperience } from "../../domain/cv/evidence-policy.js";
import { professionalSummary } from "../../domain/cv/professional-summary.js";
import { roleFocus } from "../../domain/cv/role-focus.js";
import {
  emphasizesLifecycle,
  type Tailoring,
} from "../../domain/cv/tailoring.js";
import type { Draft, Profile, Review } from "../../domain/types.js";
import type { generate } from "../../infrastructure/providers/llm.js";
import {
  composedExperiencePrompt,
  composedSummaryPrompt,
} from "../../prompts/prompts.js";
import {
  bulletWritingIssues,
  writePlannedExperience,
} from "./planned-writer.js";

type Job = {
  title: string;
  company: string;
  description: string;
  language: string;
};

// Recognize earlier compositions of the same verified phrases without requiring today's ranking.
// Arbitrary prose, altered phrases, unsupported stacks or missing references still need semantic review.
export function isReferenceSummary(draft: Draft, profile: Profile): boolean {
  const match =
    /^Desenvolvedor (Front-end|Backend|Full Stack|de software) com experiência na criação e evolução de aplicações web com (.+)\. Atuação em (.+)\.$/.exec(
      draft.summary,
    );

  if (!match || !draft.summaryEvidenceIds?.length) return false;
  const facts = profile.experiences
    .flatMap((e) => e.facts)
    .filter((f) => draft.summaryEvidenceIds!.includes(f.id));

  if (new Set(draft.summaryEvidenceIds).size !== facts.length) return false;

  if (
    match[1] === "Full Stack" &&
    !facts.some((f) => f.area === "backend" || f.area === "fullstack")
  )
    return false;

  if (
    match[1] === "Backend" &&
    !facts.some((f) => f.area === "backend" || f.area === "fullstack")
  )
    return false;

  if (
    match[1] === "Front-end" &&
    !facts.some((f) => f.area === "frontend" || f.area === "fullstack")
  )
    return false;
  const stack = match[2].split(/, | e /);

  if (
    stack.length < 1 ||
    stack.length > 4 ||
    new Set(stack).size !== stack.length ||
    stack.some(
      (s) =>
        !profile.skills.includes(s) ||
        !facts.some((f) => f.text.toLowerCase().includes(s.toLowerCase())),
    )
  )
    return false;
  const phrases = facts
    .filter((f) => f.summary && f.usage !== "context")
    .map((f) => f.summary!);

  for (let a = 0; a < phrases.length; a++)
    for (let b = 0; b < phrases.length; b++) {
      if (a === b) continue;

      if (`${phrases[a]} e ${phrases[b]}` === match[3]) return true;

      for (let c = 0; c < phrases.length; c++)
        if (
          c !== a &&
          c !== b &&
          `${phrases[a]}, ${phrases[b]} e ${phrases[c]}` === match[3]
        )
          return true;
    }

  return false;
}

export function evidenceSummary(
  profile: Profile,
  job: Job,
  ids: string[],
  allowGeneral = false,
): { summary: string; summaryEvidenceIds: string[] } | undefined {
  const composed = professionalSummary(profile, job, ids);

  if (composed) return composed;
  const english = job.language === "en";
  const phrase = (f: Profile["experiences"][number]["facts"][number]) =>
    english ? f.summaryEn : f.summary;
  const facts = profile.experiences
    .flatMap((e) => e.facts)
    .filter((f) => ids.includes(f.id) && phrase(f) && f.usage !== "context");
  const focus = roleFocus(job.title, job.description),
    frontend = focus === "frontend",
    fullstack = focus === "fullstack",
    backend = focus === "backend";

  if (!frontend && !fullstack && !backend && !allowGeneral) return;
  const selected: typeof facts = [];
  const take = (areas: string[]) => {
    const f = facts.find(
      (f) => areas.includes(f.area ?? "") && !selected.includes(f),
    );

    if (f) selected.push(f);
  };

  if (backend) {
    const integration = facts.find(
      (f) =>
        /\bREST\b|\bGraphQL\b/i.test(phrase(f) ?? "") &&
        (f.area === "backend" || f.area === "fullstack"),
    );

    if (integration) selected.push(integration);

    for (const f of facts.filter((f) => f.area === "backend"))
      if (selected.length < 2 && !selected.includes(f)) selected.push(f);

    if (selected.length < 2) take(["fullstack"]);
  } else if (fullstack && emphasizesLifecycle(job.title, job.description)) {
    const endToEnd = facts.find((f) =>
      /ponta a ponta|end.to.end/i.test(f.text),
    );

    if (endToEnd) selected.push(endToEnd);
    const components = facts.find(
      (f) =>
        f.area === "frontend" &&
        /component|estado|state/i.test(phrase(f) ?? ""),
    );

    if (components) selected.push(components);

    if (selected.length < 2) take(["frontend"]);

    if (/testes|testing|tests/i.test(job.description)) take(["quality"]);
  } else if (emphasizesLifecycle(job.title, job.description)) {
    const endToEnd = facts.find((f) =>
      /ponta a ponta|end.to.end/i.test(f.text),
    );

    if (endToEnd) selected.push(endToEnd);
    const rules = facts.find((f) =>
      /regras de neg[oó]cio|business rules/i.test(f.text),
    );

    if (rules && !selected.includes(rules)) selected.push(rules);
    take(["quality"]);

    if (selected.length < 2) take(["frontend"]);
  } else if (frontend) {
    const components = facts.find(
      (f) =>
        f.area === "frontend" &&
        /component|estado|state/i.test(phrase(f) ?? ""),
    );

    if (components) selected.push(components);
    const performance = facts.find(
      (f) =>
        f.area === "frontend" &&
        /render|cache|performance/i.test(phrase(f) ?? "") &&
        !selected.includes(f),
    );

    if (performance) selected.push(performance);

    if (selected.length < 2) take(["frontend"]);
    take(["quality"]);
  } else if (fullstack) {
    take(["frontend"]);
    take(["backend"]);
    take(["fullstack"]);
  } else {
    take(["fullstack"]);
    const f = facts.find(
      (f) => f.area === "frontend" && !/web3|ui\/ux/i.test(phrase(f) ?? ""),
    );

    if (f) selected.push(f);
    take(["quality"]);

    if (selected.length < 2) take(["backend"]);

    if (selected.length < 2) take(["frontend"]);
  }

  if (selected.length < 2) return;
  const allFacts = profile.experiences.flatMap((e) => e.facts);
  const proof = (skill: string) =>
    allFacts.find((f) => f.text.toLowerCase().includes(skill.toLowerCase()));
  const stack = (
    backend
      ? ["Node.js", "TypeScript", "NestJS"]
      : frontend
        ? ["React", "TypeScript", "Next.js", "JavaScript"]
        : /node/i.test(job.title)
          ? ["Node.js", "NestJS", "React", "TypeScript"]
          : ["React", "TypeScript", "Node.js", "NestJS"]
  )
    .filter((s) => profile.skills.includes(s) && proof(s))
    .slice(0, 3);

  if (!stack.length) return;
  const join = (items: string[]) =>
    items.length < 2
      ? items[0]
      : items.slice(0, -1).join(", ") +
        (english ? ", and " : " e ") +
        items.at(-1);
  const phrases = selected.map((f) => phrase(f)!);
  const contributions =
    (backend ||
      (fullstack && emphasizesLifecycle(job.title, job.description))) &&
    phrases.length === 2
      ? phrases.join(english ? ", as well as " : ", além de ")
      : join(phrases);
  const summary = english
    ? `${frontend ? "Frontend developer" : backend ? "Backend developer" : fullstack ? "Full stack developer" : "Software developer"} with experience building and evolving web applications using ${join(stack)}. Work includes ${contributions}.`
    : `Desenvolvedor ${frontend ? "Front-end" : backend ? "Backend" : fullstack ? "Full Stack" : "de software"} com experiência na criação e evolução de aplicações web com ${join(stack)}. Atuação em ${contributions}.`;

  return {
    summary,
    summaryEvidenceIds: [
      ...new Set([
        ...selected.map((f) => f.id),
        ...stack.map((s) => proof(s)!.id),
      ]),
    ],
  };
}

// The model writes every bullet and the summary. Reference text is historical data only.
export async function writeGroundedDraft(
  infer: typeof generate,
  model: string,
  profile: Profile,
  job: Job,
  feedback?: Review,
  previous?: Draft,
  selection?: Tailoring,
): Promise<Draft> {
  const experiences: Draft["experiences"] = [];
  const sources = selection
    ? profile.experiences.filter((e) =>
        selection.priorities.some((p) => p.sourceId === e.id),
      )
    : profile.experiences;

  for (const source of sources) {
    const old = previous?.experiences.find((e) => e.sourceId === source.id);
    const targeted = feedback?.issues.some((i) => targetsExperience(i, source));

    if (old && feedback && !targeted) {
      experiences.push(structuredClone(old));
      continue;
    }

    const ids = source.facts.map((f) => f.id) as [string, ...string[]];
    const schema = z
      .object({
        bullets: z
          .array(
            z
              .object({
                evidenceIds: z.array(z.enum(ids)).min(1).max(4),
                text: z.string().min(15).max(450),
              })
              .strict(),
          )
          .min(1)
          .max(
            source.kind === "project" || /intern|estagi/i.test(source.role)
              ? 2
              : 4,
          ),
      })
      .strict();
    const prompt = composedExperiencePrompt(
      profile,
      source,
      job,
      selection,
      feedback,
      previous,
      experiences,
    );
    let generated: z.infer<typeof schema> | undefined;
    let failures: string[] = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      generated = /qwen3\.5/i.test(model)
        ? {
            bullets: await writePlannedExperience(
              infer,
              model,
              source,
              profile,
              job,
              prompt +
                (attempt
                  ? "\n<CORRIGIR>" + JSON.stringify(failures) + "</CORRIGIR>"
                  : ""),
            ),
          }
        : schema.parse(
            await infer(
              model,
              prompt +
                (attempt
                  ? "\n<CORRIGIR>" +
                    JSON.stringify(failures) +
                    "</CORRIGIR>\n<DRAFT>" +
                    JSON.stringify(generated) +
                    "</DRAFT>\nCorrect unsupported claims using the evidence; do not substitute reference sentences."
                  : ""),
              schema,
            ),
          );

      failures = validateEvidence(
        {
          summary: "Summary not written yet.",
          skills: [],
          experiences: [{ sourceId: source.id, bullets: generated.bullets }],
        },
        profile,
      );

      failures.push(
        ...generated.bullets.flatMap((b) => bulletWritingIssues(b.text)),
      );

      if (
        new Set(generated.bullets.map((b) => b.text.trim())).size !==
        generated.bullets.length
      )
        failures.push("Duplicate bullets.");

      if (
        generated.bullets.some(
          (b) =>
            !b.evidenceIds.some((id) =>
              source.facts.some((f) => f.id === id && f.usage !== "context"),
            ),
        )
      )
        failures.push(
          "A bullet must demonstrate a contribution, not just a technology list.",
        );

      if (!failures.length) break;
    }

    if (!generated)
      throw new Error("No text was produced for " + source.company);
    // Persistent factual failures travel to the reviewer; generation.ts blocks publication.
    experiences.push({ sourceId: source.id, bullets: generated.bullets });
  }

  if (!experiences.length)
    throw new Error("Selection contains no valid experiences to write.");
  const evidenceIds = [
    ...new Set(
      experiences.flatMap((e) => e.bullets.flatMap((b) => b.evidenceIds)),
    ),
  ];
  const schema = z
    .object({
      summaryEvidenceIds: z
        .array(z.enum(evidenceIds as [string, ...string[]]))
        .min(1)
        .max(8),
      summary: z.string().min(30).max(1000),
      skills: z.array(z.enum(profile.skills as [string, ...string[]])).max(10),
    })
    .strict();
  const prompt = composedSummaryPrompt(
    profile,
    job,
    experiences,
    feedback,
    previous,
  );
  let draft: Draft | undefined,
    failures: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = schema.parse(
      await infer(
        model,
        prompt +
          (attempt
            ? "\n<CORRIGIR>" +
              JSON.stringify(failures) +
              "</CORRIGIR>\n<PREVIOUS_SUMMARY>" +
              JSON.stringify(draft?.summary) +
              "</PREVIOUS_SUMMARY>"
            : ""),
        schema,
      ),
    );

    draft = { ...result, experiences };
    failures = [
      ...validateEvidence(draft, profile),
      ...validateEditorial(draft, job.language),
    ];

    if (!failures.length) return draft;
  }

  if (draft) return draft; // No template fallback. Review must resolve remaining evidence issues.

  throw new Error("No summary produced.");
}
