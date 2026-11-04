import type { Profile } from "../types.js";

export const candidateVoiceRule = `CANDIDATE VOICE: Portuguese bullets use first-person singular past-tense verbs without repeated pronouns. English bullets use natural action-led past tense. The summary opens with current professional positioning, not a list of past tasks. Third-person source notes are factual records, not a required voice. Conjugation must preserve authorship. Third person is not an ATS requirement.`;

export const recruiterWritingRule = `RECRUITER-FOCUSED WRITING:
Write original bullets in the first person, past tense, omitting repeated pronouns. In Portuguese use first-person singular verbs; in English use natural action-led past-tense bullets. The summary states current professional positioning in two or three useful sentences about capabilities relevant to this job. Avoid endpoint inventories and self-praise. Calculated total experience provides career context, never years per technology or inferred seniority. Confirmed numbers may describe product scale, never individual growth without evidence.
Identify the three central job needs, then select the best contributions. Plan the 30-second reading: the summary establishes the role and supported differentiators; first bullets across employments should collectively demonstrate supported priorities. Within each employment compare candidate bullets, including strong cases that might otherwise appear lower down. Open with the contribution most relevant to THIS job and clarify what the candidate did or enabled. Different jobs should show complementary strengths when possible. If there is no relevant evidence, preserve the real contribution. Keep chronology and do not infer seniority, numbers or results. Prefer functionality, solved problems and useful context to endpoint counts. Participation preserves partial authorship; implementation, investigation and correction highlight confirmed execution. Do not weaken real authorship out of excessive caution or copy internal caveats into the CV.
Combine evidence only for one coherent contribution within the same organization. Suggested cases are indexes, not prewritten sentences or mandatory content. Read ALL facts, including the final ones. Compare each chosen case with the best omitted alternative. Do not hide relevant development behind auxiliary QA or repeat APIs/tests in every employment. For investigation, preserve the confirmed problem, cause, action and validation. Demonstrate collaboration through concrete actions when relevant. Summary capabilities may require additional facts beyond selected cases: check every context, including production. Near a release does not prove production or an incident during deployment. General production troubleshooting evidence supports that summary capability but does not transfer the environment to another incident.
Check explicit responsibilities beyond the top three priorities. Listing a tool does not demonstrate a confirmed practice. Compare peripheral delivery with omitted professional evidence of relevant requirements, such as limited cloud usage, container images or CI/CD changes. Rebalance within the correct employment when this improves the whole CV, without transferring work between companies, inventing ownership or discarding core evidence. Never add content for keyword counts. Preserve useful investigation, collaboration and tests when space allows; examples in this rule are not a mandatory checklist.
Personal projects compete with omitted core professional contributions. Before selecting a project for BFF, retries or another keyword, compare its functional value with the best omitted professional evidence. A backend-only project should not displace stronger professional frontend architecture, performance, components or accessibility for a predominantly frontend role. Include it when its relevance is central and outweighs the alternative. Extra keyword coverage alone is not an improvement. Reviewers must make the same comparison before requesting additions and preserve strong versions without inflating the CV.
Usually use 2-3 bullets per employment, up to 4 when necessary; internships/projects use 1-2. These counts and 20-40 words per bullet are guidance, not quotas. Keep each bullet centered on one idea. Respect the 55-word contract limit. Summarize incidents using the problem, contribution and confirmed validation/result. Include chronology, version names and internal mechanisms only when differentiating for the job. Avoid incident-report detail and vague claims about solving problems. Compare technical execution with confirmed release responsibility, prioritization and client communication. Leading one delivery does not imply people management, a lead title or permanent leadership. Do not invent causal links between incidents and leadership. Preserve recent employment in reverse chronology. Write concisely for one readable A4 page, removing repetition before essential evidence.
Mention technologies naturally within supported actions. presentation.technologySelections is a short supplementary line per employment, not an inventory: [] is allowed, maximum 8. Do not add technology footers inside bullets. draft.skills is metadata, not a top-of-page list. Relevant studies appear only under localized Skills, never as professional practice. presentation.educationIndices selects relevant original entries without changing facts. Do not change layout.
Adapt emphasis: frontend prioritizes interfaces, components/state, performance, accessibility, tests and collaboration as requested; full stack balances supported interfaces, backend, data and integrations; backend prioritizes confirmed APIs, rules, data and quality. Do not force every nice-to-have or invent numbers.`;

// Closed month ranges only, with overlap deduplicated. Never count personal projects.
export function careerDuration(
  profile: Profile,
  language: "en" | "pt-BR" = "en",
) {
  const months = new Set<number>();

  for (const e of profile.experiences.filter((e) => e.kind === "work")) {
    const m = e.period.match(/^(\d{2})\/(\d{4})\s*[-–—]\s*(\d{2})\/(\d{4})$/);

    if (!m) continue;
    const [, sm, sy, em, ey] = m.map(Number),
      start = sy * 12 + sm - 1,
      end = ey * 12 + em - 1;

    if (
      sm < 1 ||
      sm > 12 ||
      em < 1 ||
      em > 12 ||
      end < start ||
      end - start > 1200
    )
      continue;

    for (let n = start; n <= end; n++) months.add(n);
  }

  const years = Math.floor(months.size / 12);

  return {
    months: months.size,
    completedYears: years,
    scope:
      "Total professional duration, including internships and freelance; does not prove years per stack or role.",
    claim: years
      ? language === "pt-BR"
        ? `${months.size > years * 12 ? "mais de " : ""}${years} ${years === 1 ? "ano" : "anos"} de experiência profissional`
        : `${months.size > years * 12 ? "over " : ""}${years} ${years === 1 ? "year" : "years"} of professional experience`
      : null,
  };
}

// Normalize conjugation only for existing factual guards, never for output prose.
export function evidenceVoice(text: string) {
  const pairs: Record<string, string> = {
    implementei: "implementou",
    desenvolvi: "desenvolveu",
    criei: "criou",
    integrei: "integrou",
    entreguei: "entregou",
    investiguei: "investigou",
    corrigi: "corrigiu",
    validei: "validou",
    identifiquei: "identificou",
    trabalhei: "trabalhou",
    participei: "participou",
    colaborei: "colaborou",
    contribuí: "contribuiu",
    evoluí: "evoluiu",
    refatorei: "refatorou",
    migrei: "migrou",
    utilizei: "utilizou",
    escrevi: "escreveu",
    realizei: "realizou",
    otimizei: "otimizou",
    melhorei: "melhorou",
    reduzi: "reduziu",
    aumentei: "aumentou",
    garanti: "garantiu",
    assegurei: "assegurou",
    liderei: "liderou",
    avaliei: "avaliou",
    analisei: "analisou",
    adaptei: "adaptou",
    documentei: "documentou",
  };

  return text.replace(
    /[\p{L}]+/gu,
    (word) => pairs[word.toLocaleLowerCase("pt-BR")] ?? word,
  );
}
