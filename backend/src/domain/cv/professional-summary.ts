import type { Profile } from "../types.js";
import { roleFocus } from "./role-focus.js";
import { emphasizesLifecycle } from "./tailoring.js";

// Compositions use only delivery facts selected for this CV, never requirements as evidence.
export function professionalSummary(
  profile: Profile,
  job: { title: string; description: string; language: string },
  ids: string[],
) {
  const english = job.language === "en",
    focus = roleFocus(job.title, job.description);
  const facts = profile.experiences
    .flatMap((e) => e.facts)
    .filter((f) => ids.includes(f.id) && f.usage !== "context");
  const definitions = [
    {
      key: "components",
      rx: /componentes reutilizáveis.*(?:estado|Zustand)|(?:estado|Zustand).*componentes reutilizáveis/i,
      pt: "componentes reutilizáveis e gerenciamento de estado",
      en: "reusable components and state management",
    },
    {
      key: "integration",
      rx: /integrou.*APIs REST|integrando APIs REST/i,
      pt: "integrações com APIs REST",
      en: "REST API integrations",
    },
    {
      key: "performance",
      rx: /otimiza.*renderiza/i,
      pt: "otimizações de renderização",
      en: "rendering optimizations",
    },
    {
      key: "testing",
      rx: /utilizou.*(?:Jest|Vitest|Testing Library).*testes/i,
      pt: "testes de aplicações",
      en: "application testing",
    },
    {
      key: "refactoring",
      rx: /refatorou código/i,
      pt: "refatoração de código",
      en: "code refactoring",
    },
    {
      key: "rules",
      rx: /corrigiu regras de negócio/i,
      pt: "correções de regras de negócio",
      en: "business rule corrections",
    },
    {
      key: "endpoint",
      rx: /endpoint.*(?:Node.js|NestJS)|(?:Node.js|NestJS).*endpoint/i,
      pt: "endpoints backend",
      en: "backend endpoints",
    },
    {
      key: "delivery",
      rx: /entregou funcionalidades ponta a ponta/i,
      pt: "entregas ponta a ponta",
      en: "end-to-end feature delivery",
    },
  ];
  const priorities =
    focus === "frontend"
      ? ["components", "integration", "performance", "testing", "refactoring"]
      : focus === "backend"
        ? ["integration", "endpoint", "rules", "testing", "delivery"]
        : focus === "fullstack" &&
            emphasizesLifecycle(job.title, job.description)
          ? ["delivery", "components", "integration", "testing", "rules"]
          : focus === "fullstack"
            ? [
                "components",
                "integration",
                "rules",
                "testing",
                "delivery",
                "endpoint",
                "refactoring",
              ]
            : [
                "delivery",
                "refactoring",
                "rules",
                "testing",
                "integration",
                "components",
              ];
  const demands: Record<string, RegExp> = {
    components: /component|estado|zustand|redux/i,
    integration: /integra|REST|GraphQL/i,
    performance: /performance|desempenho|otimiza|render/i,
    testing: /test|qualidade|quality/i,
    refactoring: /refator|refactor|legado/i,
    rules: /regras de neg|business rules/i,
    endpoint: /endpoint|API|backend|back-end/i,
    delivery: /ponta a ponta|end.to.end|ciclo de vida/i,
  };

  // Keep role-appropriate concepts, but lead with responsibilities explicitly requested.
  priorities.sort(
    (a, b) =>
      Number(demands[b].test(job.description ?? "")) -
      Number(demands[a].test(job.description ?? "")),
  );

  const selected = priorities
    .flatMap((key) => {
      const d = definitions.find((d) => d.key === key)!;
      const f = facts.find((f) => d.rx.test(f.text));

      return f ? [{ ...d, fact: f }] : [];
    })
    .slice(0, 4);

  if (selected.length < 3) return;
  const names =
    focus === "backend"
      ? ["Node.js", "TypeScript", "NestJS"]
      : focus === "frontend"
        ? ["React", "TypeScript", "Next.js"]
        : ["React", "TypeScript", "Node.js", "NestJS"];
  const stack = names.filter(
    (s) => profile.skills.includes(s) && facts.some((f) => f.text.includes(s)),
  );

  if (!stack.length) return;
  const join = (a: string[]) =>
    a.length < 2
      ? a[0]
      : a.slice(0, -1).join(", ") +
        ((english ? / and / : / e /).test(a.at(-1)!)
          ? ", "
          : english
            ? " and "
            : " e ") +
        a.at(-1);
  const role = english
    ? focus === "frontend"
      ? "Frontend developer"
      : focus === "backend"
        ? "Backend developer"
        : focus === "fullstack"
          ? "Full stack developer"
          : "Software developer"
    : focus === "frontend"
      ? "Desenvolvedor Front-end"
      : focus === "backend"
        ? "Desenvolvedor Backend"
        : focus === "fullstack"
          ? "Desenvolvedor Full Stack"
          : "Desenvolvedor de software";
  const phrases = selected.map((s) =>
    s.key === "integration" &&
    /GraphQL/i.test(s.fact.text) &&
    (focus === "backend" || /GraphQL/i.test(job.description))
      ? english
        ? "REST and GraphQL integrations"
        : "integrações REST e GraphQL"
      : english
        ? s.en
        : s.pt,
  );
  const summary = english
    ? `${role} with experience building web applications using ${join(stack)}. Work includes ${phrases.slice(0, 2).join(", as well as ")}. Additional experience includes ${phrases.slice(2).join(english ? ", as well as " : ", além de ")}.`
    : `${role} com experiência em aplicações web com ${join(stack)}. Atuação em ${phrases.slice(0, 2).join(", além de ")}. Experiência também com ${phrases.slice(2).join(english ? ", as well as " : ", além de ")}.`;
  const summaryEvidenceIds = [
    ...new Set([
      ...selected.flatMap((s) =>
        s.key === "endpoint"
          ? facts.filter((f) => s.rx.test(f.text)).map((f) => f.id)
          : [s.fact.id],
      ),
      ...stack.map((s) => facts.find((f) => f.text.includes(s))!.id),
    ]),
  ];

  return {
    summary: summary.replace(
      "com integrações com APIs REST",
      "com integrações REST",
    ),
    summaryEvidenceIds,
  };
}
