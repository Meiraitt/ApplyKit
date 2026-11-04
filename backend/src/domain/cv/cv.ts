import type { Cv, Draft, Profile } from "../types.js";
import { contextualizeTechnologies } from "./cv-context.js";
import { careerDuration, evidenceVoice } from "./cv-editorial.js";
import { bulletWritingIssues, relationalIssues } from "./evidence-policy.js";
import { roleFocus } from "./role-focus.js";
import { mentions, unsupportedTechnologies } from "./tailoring.js";

function numbers(text: string) {
  return [
    ...text.matchAll(
      /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?:\s*(?:milhões|milhão|million|thousand|mil|k)\b|%)?/giu,
    ),
  ].map((m) => {
    const raw = m[0].toLowerCase();
    const amount = raw.match(/^[\d.,]+/)![0];
    const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(amount)
      ? amount.replace(/[.,]/g, "")
      : amount.replace(",", ".");
    const multiplier = /milh|million/.test(raw)
      ? 1e6
      : /mil|thousand|k$/.test(raw)
        ? 1e3
        : 1;

    return `${Number(normalized) * multiplier}${raw.endsWith("%") ? "%" : ""}`;
  });
}

// A narrow guard for common invented quality claims; semantic review remains necessary.
function unsupportedQualities(text: string, evidence: string): string[] {
  text = evidenceVoice(text);
  const groups = [
    /complex[oa]s?|complex/gi,
    /escal[aá]ve(?:l|is)|scalable/gi,
    /alta performance|high.performance/gi,
    /especialista|especializad[oa]|expertise|expert/gi,
    /liderou|chefiou|led a team|managed a team/gi,
    /robust[oa]s?|robust/gi,
    /intuitiv[oa]s?|intuitive/gi,
    /alto impacto|high.impact/gi,
    /\b(?:melhor\w*|aument\w*|aprimor\w*|garant\w*|reduz\w*)\b[^.!?;]{0,65}\b(?:escalabilidade|manutenibilidade|robustez|qualidade|acoplamento)\b/gi,
  ];

  return groups.flatMap((rx) => {
    const claims = text.match(rx) ?? [];

    rx.lastIndex = 0;

    return claims.length && !rx.test(evidence) ? [...new Set(claims)] : [];
  });
}

function scopeIssues(text: string, evidence: string): string[] {
  text = evidenceVoice(text);
  const issues: string[] = [];
  // Check the object of authorship: implementing hydration does not prove endpoint implementation.
  const endpointImplementation =
    /\b(?:implementou|desenvolveu|criou|implemented|developed|built|created)\s+(?:(?:um|o|an?|the)\s+)?(?:(?:Node\.?js|NestJS|REST|GraphQL|administrative|admin|e|and)\s+){0,6}endpoints?\b/i;
  const endpointParticipation =
    /\b(?:trabalhou|colaborou|participou|worked|contributed|participated)\b[^;\n]{0,95}\bendpoint\b/i;

  if (
    endpointImplementation.test(text) &&
    endpointParticipation.test(evidence) &&
    !endpointImplementation.test(evidence)
  )
    issues.push(
      "Inflated endpoint authorship: evidence confirms participation, not implementation. Preserve backend participation without forcing weak phrasing; confirmed frontend hydration implementation is a separate action.",
    );
  const createsDesignSystem =
    /(?:criou|desenvolveu|created|developed|built)\s+(?:(?![.;]|\b(?:evoluiu|improved|evolved)\b).){0,100}\bdesign systems?\b/i;

  if (createsDesignSystem.test(text) && !createsDesignSystem.test(evidence))
    issues.push(
      "Unsupported design-system creation: preserve evolution/maintenance without claiming complete creation.",
    );
  const apiStability =
    /integra\w*[^.!?]{0,160}(?:APIs?|REST)[^.!?]{0,90}(?:estabilidade|stability)/i;

  if (apiStability.test(text) && !apiStability.test(evidence))
    issues.push(
      "Unsupported effect or purpose: API integration does not prove improved stability. Describe only the confirmed integration.",
    );
  const scopes = [
    {
      claim: /usuários? ativos?|active users?/i,
      source: /usuários? ativos?|active users?/i,
      label: "active users",
    },
    {
      claim: /usuários? cadastrados?|registered users?/i,
      source: /usuários? cadastrados?|registered users?/i,
      label: "registered users",
    },
    {
      claim: /carteiras?|wallets?/i,
      source: /carteiras?|wallets?/i,
      label: "carteiras",
    },
  ];

  for (const scope of scopes)
    if (scope.claim.test(text) && !scope.source.test(evidence))
      issues.push(
        `Unsupported unit or qualifier: ${scope.label}. Preserve the metric's meaning.`,
      );

  if (
    /\d/.test(text) &&
    /picos?|peaks?/i.test(evidence) &&
    /acessos?|accesses|visits/i.test(text) &&
    !/picos?|peaks?/i.test(text)
  )
    issues.push(
      "Metric missing its peak qualifier; do not present peak as recurring volume.",
    );

  if (
    /\d/.test(text) &&
    /acessos? mensais|monthly (?:accesses|visits)/i.test(evidence) &&
    /acessos?|accesses|visits/i.test(text) &&
    !/mensais|mensal|monthly|per month/i.test(text)
  )
    issues.push("Metric missing the confirmed monthly period.");

  if (
    /stack registrada|sem métricas|não foram informad|não há detalhes confirmados/i.test(
      text,
    )
  )
    issues.push(
      "Internal evidence note leaked into the CV. Describe only the confirmed activity.",
    );
  const qualified = [
    ...evidence.matchAll(
      /(?:mais de|more than|over)\s+(\d+(?:[.,]\d+)*(?:\s*(?:milhões|milhão|million|thousand|mil|k)\b)?)/gi,
    ),
  ].flatMap((m) => numbers(m[1]));

  if (
    qualified.some((n) => numbers(text).includes(n)) &&
    !/(mais de|more than|over)\s+\d/i.test(text)
  )
    issues.push("Metric missing the confirmed over qualifier.");

  if (
    /para melhorar|to improve/i.test(evidence) &&
    /melhorou|melhorando|improved|improving/i.test(text)
  )
    issues.push(
      "Objective turned into result: preserve the intent to improve without claiming an unsupported outcome.",
    );

  if (
    /identific|identified/i.test(evidence) &&
    /corrigi|corrigiu|corrigindo|resolved|fixed/i.test(text) &&
    !/corrigi|corrigiu|corrigindo|resolved|fixed/i.test(evidence)
  )
    issues.push(
      "Identification turned into correction; the fact only confirms identifying the problem.",
    );

  if (
    /em produção|in production/i.test(text) &&
    !/produção|production/i.test(evidence)
  )
    issues.push("Production environment is absent from cited evidence.");

  if (/\b(?:desenvolveu|implementou)\b.+ e na hidratação/i.test(text))
    issues.push(
      "Correct parallelism: distinguish endpoint development from state hydration implementation.",
    );

  if (
    (evidence.match(/\bum endpoint\b/gi) ?? []).length === 1 &&
    !/\bendpoints\b/i.test(evidence) &&
    /\bendpoints\b/i.test(text)
  )
    issues.push(
      "Preserve singular scope: evidence confirms one endpoint, not multiple endpoints.",
    );

  if (
    /(?:documentou|escreveu|registrou).*(?:BDD|tarefas|issues).*(?:usando|utilizando)\s+(?:Cypress|Jest|Vitest|Testing Library)/i.test(
      text,
    )
  )
    issues.push(
      "Separate BDD task documentation from test-tool usage; the tools were not used to write tasks.",
    );
  const activities = [
    {
      rx: /administrativ|permiss[õo]|permissions?|\broles\b|\bcargos\b/i,
      label: "permission management",
    },
    { rx: /leaderboard|ranking/i, label: "leaderboard" },
    { rx: /drafts?|rascunhos?/i, label: "drafts" },
  ];

  for (const activity of activities)
    if (activity.rx.test(text) && !activity.rx.test(evidence))
      issues.push(
        `Unsupported contribution in references: ${activity.label}. Do not transfer features between experiences.`,
      );

  const backendPerformance =
    /(?:performance|desempenho|otimiza\w*)\s+(?:(?:de|do|da|dos|das|no|na|nos|nas|em)\s+)?(?:backend|back-end|APIs?|endpoints?)\b|\b(?:optimi[sz](?:ed|ing)|improved?)\s+(?:the\s+)?(?:backend|back-end|API|endpoint)\b|\b(?:backend|back-end|API|endpoint)\s+(?:performance|optimi[sz]ation)/i;

  if (backendPerformance.test(text) && !backendPerformance.test(evidence))
    issues.push(
      "Unsupported API/backend performance optimization. Describe frontend optimization and endpoint implementation as distinct activities without transferring outcomes.",
    );

  return issues;
}

export function validateEvidence(draft: Draft, profile: Profile): string[] {
  const issues: string[] = [];

  for (const technology of unsupportedTechnologies(
    [
      draft.summary,
      ...draft.experiences.flatMap((e) => e.bullets.map((b) => b.text)),
    ].join(" "),
    profile,
  ))
    issues.push(
      `Unsupported technology in text: ${technology}. Remove the claim; do not add the technology to the profile.`,
    );

  for (const skill of draft.skills)
    if (!profile.skills.includes(skill))
      issues.push(`Unsupported skill: ${skill}`);

  if (draft.presentation) {
    const p = draft.presentation;

    if (!p.educationIndices.length && profile.education.length)
      issues.push("Select at least one relevant original education entry.");

    if (
      new Set(p.educationIndices).size !== p.educationIndices.length ||
      p.educationIndices.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= profile.education.length,
      )
    )
      issues.push("Invalid or duplicate education index.");

    if (
      new Set(p.technologySelections.map((s) => s.sourceId)).size !==
      p.technologySelections.length
    )
      issues.push("Duplicate technology selection for experience.");

    for (const selection of p.technologySelections) {
      const source = profile.experiences.find(
        (e) => e.id === selection.sourceId,
      );

      if (
        !source ||
        !draft.experiences.some((e) => e.sourceId === selection.sourceId)
      )
        issues.push(
          "Technology selection refers to absent experience: " +
            selection.sourceId,
        );

      for (const tech of selection.technologies)
        if (!source?.facts.some((f) => mentions(f.text, tech)))
          issues.push(
            "Unsupported technology in company " +
              selection.sourceId +
              ": " +
              tech,
          );

      if (
        selection.technologies.length > 8 ||
        new Set(selection.technologies).size !== selection.technologies.length
      )
        issues.push(
          "Linha de tecnologias extensa ou duplicada: " + selection.sourceId,
        );
    }
  }

  const allFacts = profile.experiences.flatMap((e) => e.facts);
  const levels =
    draft.summary.match(
      /\b(?:j[uú]nior|pleno|s[eê]nior)\b|\b(?:engineer|developer)\s+(?:II|III|IV)\b/gi,
    ) ?? [];

  for (const level of levels)
    if (
      !profile.experiences.some((e) =>
        e.role.toLowerCase().includes(level.toLowerCase()),
      )
    )
      issues.push(
        `Unsupported seniority in summary: "${level}". Do not copy job seniority; describe confirmed work and contributions.`,
      );

  if (draft.summaryEvidenceIds) {
    const summaryFacts = allFacts.filter((f) =>
      draft.summaryEvidenceIds!.includes(f.id),
    );

    if (
      !draft.summaryEvidenceIds.length ||
      summaryFacts.length !== new Set(draft.summaryEvidenceIds).size
    )
      issues.push("Invalid summary reference.");
    const supported = numbers(summaryFacts.map((f) => f.text).join(" "));
    const evidenceText = summaryFacts.map((f) => f.text).join(" ");

    if (
      /microservi[cç]os|\bBFF\b|Module Federation/i.test(draft.summary) &&
      summaryFacts.some((f) => /projeto pessoal/i.test(f.text)) &&
      !/projetos? pessoa(?:l|is)|personal projects?/i.test(draft.summary)
    )
      issues.push(
        "Summary: distinguish personal project practice from professional experience.",
      );
    issues.push(
      ...relationalIssues(draft.summary, summaryFacts).map(
        (i) => i + " (summary)",
      ),
    );

    issues.push(
      ...scopeIssues(draft.summary, evidenceText).map(
        (i) =>
          `${i} (summary) Excerpt: "${draft.summary}". References: ${draft.summaryEvidenceIds!.join(", ")}.`,
      ),
    );

    for (const technology of unsupportedTechnologies(draft.summary, {
      ...profile,
      skills: [],
      experiences: [{ ...profile.experiences[0], facts: summaryFacts }],
    }))
      issues.push(
        `Unsupported technology in summary references: ${technology}.`,
      );
    const summaryWithoutTenure = (["en", "pt-BR"] as const).reduce(
      (text, language) => {
        const claim = careerDuration(profile, language).claim;

        return claim ? text.replace(claim, "") : text;
      },
      draft.summary,
    );

    for (const number of numbers(summaryWithoutTenure))
      if (!supported.includes(number))
        issues.push("Unsupported number (" + number + ") in summary.");

    for (const claim of unsupportedQualities(
      draft.summary,
      summaryFacts.map((f) => f.text).join(" "),
    ))
      issues.push(
        `Unsupported summary attribute: "${claim}". Remove the attribute and describe the confirmed activity.`,
      );
  }

  if (new Set(draft.skills).size !== draft.skills.length)
    issues.push("Habilidade duplicada.");
  const ids = new Set<string>();

  for (const item of draft.experiences) {
    const source = profile.experiences.find((e) => e.id === item.sourceId);

    if (!source) {
      issues.push(`Unknown experience: ${item.sourceId}`);
      continue;
    }

    if (ids.has(item.sourceId)) issues.push("Duplicate experience.");
    ids.add(item.sourceId);

    if (
      new Set(item.bullets.map((b) => b.text.trim())).size !==
      item.bullets.length
    )
      issues.push(`Duplicate bullets in ${source.company}.`);

    for (const bullet of item.bullets) {
      const evidence = source.facts.filter((f) =>
        bullet.evidenceIds.includes(f.id),
      );

      if (evidence.length !== new Set(bullet.evidenceIds).size)
        issues.push(`Invalid reference in ${source.company}.`);

      if (evidence.length && evidence.every((f) => f.usage === "context"))
        issues.push(
          `Bullet without contribution in ${source.company}: only context facts were cited.`,
        );
      const evidenceText = evidence.map((e) => e.text).join(" ");

      issues.push(
        ...relationalIssues(bullet.text, evidence).map(
          (i) => i + " (" + source.company + ") Excerpt: " + bullet.text,
        ),
      );

      issues.push(
        ...scopeIssues(bullet.text, evidenceText).map(
          (i) =>
            `${i} (${source.company}) Excerpt: "${bullet.text}". References: ${bullet.evidenceIds.join(", ")}.`,
        ),
      );

      for (const technology of unsupportedTechnologies(bullet.text, {
        ...profile,
        skills: [],
        experiences: [{ ...source, facts: evidence }],
      }))
        issues.push(
          `Unsupported technology in references for ${source.company}: ${technology}. Cite evidence from the same experience or remove the claim.`,
        );
      const supported = numbers(evidenceText);

      for (const number of numbers(bullet.text))
        if (!supported.includes(number))
          issues.push(
            `Unsupported number (${number}) em ${source.company}. Excerpt: ${JSON.stringify(bullet.text)}. References: ${bullet.evidenceIds.join(", ")}.`,
          );

      for (const claim of unsupportedQualities(bullet.text, evidenceText))
        issues.push(
          `Unsupported attribute in ${source.company}: "${claim}". Remove the attribute and describe the confirmed activity.`,
        );
    }
  }

  return issues;
}

export function validateEditorial(
  draft: Draft,
  language?: string,
  voice: "first" | "either" = "either",
): string[] {
  const issues: string[] = [];

  for (const e of draft.experiences)
    for (const [index, b] of e.bullets.entries()) {
      const location = `${e.sourceId}, bullet ${index + 1} (${b.text.trim().split(/\s+/).length} words)`;

      issues.push(
        ...bulletWritingIssues(b.text).map(
          (i) => `${location}: ${i} Excerpt: ${JSON.stringify(b.text)}`,
        ),
      );

      if (
        /(?:tecnologias utilizadas|práticas utilizadas|technologies used|tech stack)\s*:/i.test(
          b.text,
        )
      )
        issues.push(
          `${location}: remove the embedded technology/practice list and preserve the contribution. The renderer adds confirmed technologies. Excerpt: ${JSON.stringify(b.text)}`,
        );
    }

  if (language === "pt-BR" && voice === "first")
    for (const e of draft.experiences)
      for (const [index, b] of e.bullets.entries()) {
        if (
          /\b(?:implementou|desenvolveu|integrou|entregou|otimizou|realizou|trabalhou|contribuiu|criou|evoluiu|participou|investigou|corrigiu|migrou|utilizou|refatorou|escreveu|colaborou|validou|identificou)\b/iu.test(
            b.text,
          )
        )
          issues.push(
            `${e.sourceId}, bullet ${index + 1}: use first-person singular, preserving authorship and facts. Excerpt: ${JSON.stringify(b.text)}`,
          );
      }

  if (
    /^(?:desenvolveu|implementou|realizou|contribuiu|participou|developed|implemented|contributed|participated|worked|performed)\b/i.test(
      draft.summary.trim(),
    )
  )
    issues.push(
      "Summary lacks professional positioning: do not open with a series of past-tense bullets. Synthesize the role and confirmed capabilities.",
    );

  if (
    /^software (?:engineer|developer),\s*(?:focusing|working)/i.test(
      draft.summary.trim(),
    )
  )
    issues.push(
      "Fragmented English summary opening. Use natural positioning such as Software developer with experience, without extending facts.",
    );

  if (language)
    for (const item of [
      { text: draft.summary, section: "Summary" },
      ...draft.experiences.flatMap((e) =>
        e.bullets.map((b) => ({ text: b.text, section: e.sourceId })),
      ),
    ]) {
      const english = (
        item.text.match(
          /\b(?:with|and|the|experience|experienced|developed|implemented|integrated|improved|worked|skilled|proficient)\b/gi,
        ) ?? []
      ).length;
      const portuguese = (
        item.text.match(
          /\b(?:com|para|desenvolveu|implementou|integrou|trabalhou|realizou)\b|experiência|atuação|otimizações/gi,
        ) ?? []
      ).length;

      if (language === "pt-BR" && english >= 2 && portuguese === 0)
        issues.push(
          `Wrong language in ${item.section}: text is English but the CV must be Brazilian Portuguese.`,
        );

      if (language === "en" && portuguese >= 2 && english === 0)
        issues.push(
          `Wrong language in ${item.section}: faithfully translate to English without changing evidence.`,
        );
    }

  return issues;
}

export function assembleCv(
  draft: Draft,
  profile: Profile,
  language: "pt-BR" | "en",
  jobTitle = "",
  description = "",
): Cv {
  const focus = roleFocus(jobTitle, description),
    frontend = focus === "frontend",
    fullstack = focus === "fullstack";
  const label = frontend
    ? language === "en"
      ? "Frontend Developer"
      : "Desenvolvedor Front-end"
    : fullstack
      ? language === "en"
        ? "Full Stack Developer"
        : "Desenvolvedor Full Stack"
      : focus === "backend"
        ? language === "en"
          ? "Backend Developer"
          : "Desenvolvedor Backend"
        : "";
  const headlineSkills = frontend
    ? ["React", "TypeScript", "Next.js", "JavaScript"].filter((s) =>
        draft.skills.includes(s),
      )
    : focus === "backend"
      ? ["Node.js", "TypeScript", "NestJS", "REST APIs", "PostgreSQL"].filter(
          (s) => draft.skills.includes(s),
        )
      : fullstack
        ? draft.skills.filter((s) =>
            ["React", "TypeScript", "Node.js", "NestJS"].includes(s),
          )
        : draft.skills;
  const headline = label
    ? [label, ...headlineSkills.slice(0, 3)].join(" | ")
    : profile.headline;

  return contextualizeTechnologies(
    {
      name: profile.name,
      headline,
      contact: profile.contact,
      summary: draft.summary,
      skills: draft.skills,
      experiences: profile.experiences.flatMap((source) => {
        const item = draft.experiences.find((e) => e.sourceId === source.id);
        const role =
          language === "en" &&
          source.role === "Desenvolvedor Full Stack (freelance)"
            ? "Full Stack Developer (Freelance)"
            : source.role;

        return item
          ? [
              {
                company: source.company,
                role,
                period: source.period,
                kind: source.kind,
                bullets: item.bullets.map((b) => b.text),
              },
            ]
          : [];
      }),
      education: profile.education,
      languages: profile.languages,
      language,
    },
    draft,
    profile,
    description,
  );
}
