import { evidenceVoice } from "./cv-editorial.js";

export const relationRule = `RELATIONSHIPS BETWEEN FACTS: each fact is independent. Combine related actions, but assign tools, causes, results and responsibility only when that relationship is expressed in the source. GraphQL knowledge plus an integration does not prove that integration uses GraphQL. Incident fixes plus performance measurement do not prove those incidents affected those metrics. Evaluating is not improving. Participating is not complete implementation. Unconfirmed statements are absence of evidence. Preserve separate clauses without a supported link. Relevance comes from concrete contributions, not presumed benefits, guarantees, adjectives or transferred technologies.`;

export function affirmativeEvidence(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .filter(
      (s) =>
        !/^\s*(?:não (?:foram|foi|há|houve)|sem (?:evidência|confirmação)|not confirmed|no (?:confirmed|evidence))/i.test(
          s,
        ),
    )
    .join(" ");
}

export function relationalIssues(
  text: string,
  facts: Array<{ text: string }>,
): string[] {
  text = evidenceVoice(text);
  const sources = facts.map((f) => affirmativeEvidence(f.text)),
    evidence = sources.join(" "),
    issues: string[] = [];
  const metrics = /\b(?:LCP|INP|CLS)\b|Core Web Vitals/i;
  const outcome =
    /(?:otimiz(?:ou|ando|aram)|optimiz(?:ed|ing)|melhor(?:ou|ando|aram)|reduz(?:iu|indo|iram)|aument(?:ou|ando|aram)|impact(?:ou|aram)|afet(?:ou|aram)|improv(?:ed|ing)|reduc(?:ed|ing)|affected)[^.!?;]{0,100}(?:\b(?:LCP|INP|CLS)\b|Core Web Vitals|métricas)/i;
  // An explicitly coordinated measurement is a separate action, not an outcome:
  // "Optimized rendering and measured LCP" does not claim improved LCP.
  const hasMetricOutcome = (value: string) =>
    value
      .split(
        /\s+(?:e|and)\s+(?=(?:avaliou|mediu|monitorou|analisou|assessed|measured|monitored)\b|trabalhou\s+na\s+avaliação\b)/i,
      )
      .some((s) => outcome.test(s));

  if (
    hasMetricOutcome(text) &&
    !sources.some((s) => metrics.test(s) && hasMetricOutcome(s))
  )
    issues.push(
      "Unsupported relationship between action and performance metrics. Describe optimization and measurement separately without claiming impact or improvement.",
    );
  const assurance =
    /garant(?:iu|indo|ir)|assegur(?:ou|ando)|guarantee|ensured/i;

  if (assurance.test(text) && !assurance.test(evidence))
    issues.push(
      "Unconfirmed outcome guarantee. Remove the guarantee and preserve the concrete activity.",
    );

  for (const term of ["OAuth2", "idempotência", "idempotency"])
    if (
      text.toLowerCase().includes(term.toLowerCase()) &&
      !evidence.toLowerCase().includes(term.toLowerCase())
    )
      issues.push(
        "Unconfirmed detail: " +
          term +
          ". Negative source mentions do not authorize claims of usage or absence.",
      );
  const e2e = /\bE2E\b|ponta a ponta|end.to.end/i;

  if (
    e2e.test(text) &&
    /teste|test/i.test(text) &&
    !sources.some((s) => e2e.test(s) && /teste|test/i.test(s))
  )
    issues.push(
      "Unconfirmed test type: cited tools do not establish end-to-end testing. Preserve only explicitly confirmed types.",
    );

  for (const object of ["administrativ", "draft"]) {
    const owns = new RegExp(
      "(?:implement(?:ou|ando)|desenvolv(?:eu|endo)|cri(?:ou|ando))(?:(?!trabalhou|participou|colaborou)[^.!?;]){0,120}\\bendpoints?\\b[^.!?;]{0,60}" +
        object,
      "i",
    );
    const relevant = sources.filter((s) =>
      new RegExp("endpoint[^.!?;]{0,100}" + object, "i").test(s),
    );

    if (
      owns.test(text) &&
      relevant.some((s) => /trabalhou|participou|colaborou/i.test(s)) &&
      !relevant.some((s) => owns.test(s))
    )
      issues.push(
        "Inflated endpoint authorship for " +
          object +
          ": implementing another endpoint does not prove authorship of this one. Preserve participation in the specific object.",
      );
  }

  const sentences = text.split(/(?<=[.!?])\s+|;/);

  if (
    sentences.some(
      (s) => /\bbridge\b|fluxo de tokens/i.test(s) && /GraphQL/i.test(s),
    ) &&
    !sources.some(
      (s) => /\bbridge\b|fluxo de tokens/i.test(s) && /GraphQL/i.test(s),
    )
  )
    issues.push(
      "GraphQL was associated with the bridge without supporting evidence. Separate distinct integrations.",
    );
  // Participation in an integration must not borrow authorship from another action.
  const participation =
    /participou[^.!?;]{0,100}implementa[çc][aã]o[^.!?;]{0,100}integra[çc][aã]o/i;

  if (
    sources.some((s) => participation.test(s)) &&
    /(?:implementou|criou|desenvolveu)\s+(?:a\s+|uma\s+)?integra[çc][aã]o/i.test(
      text,
    ) &&
    !sources.some((s) =>
      /^(?:implementou|criou|desenvolveu)\s+(?:a\s+|uma\s+)?integra[çc][aã]o/i.test(
        s,
      ),
    )
  )
    issues.push(
      "Inflated integration authorship: the source confirms implementation participation, not complete implementation.",
    );

  return issues;
}

export function targetsExperience(
  issue: { section: string; problem: string; fix: string },
  source: { id: string; company: string; facts: Array<{ id: string }> },
) {
  if (/^(?:resumo|summary)$/i.test(issue.section.trim())) return false;

  if (issue.section === source.id) return true;
  const text = issue.problem + " " + issue.fix;
  const boundary = (word: string) =>
    new RegExp(
      "(?<![\\w-])" +
        word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "(?![\\w-])",
      "i",
    ).test(text);

  return (
    boundary(source.company) ||
    boundary(source.id) ||
    source.facts.some((f) => boundary(f.id))
  );
}

export function bulletWritingIssues(text: string) {
  const issues: string[] = [];

  if (text.trim().split(/\s+/).length > 55)
    issues.push(
      "Bullet too long: select one central contribution and reduce to about 20–40 words; do not concatenate independent activities.",
    );

  if (
    /[,;:]$/.test(text.trim()) ||
    /\b(?:e|com|para|de|do|da|que|and|with|for|the)$/i.test(text.trim())
  )
    issues.push(
      "Truncated sentence: complete the contribution without cutting words or enumerations.",
    );

  return issues;
}
