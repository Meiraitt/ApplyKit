export type Generation = {
  token_usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    measured: boolean;
    calls: {
      role: string;
      inputTokens: number;
      outputTokens: number;
      measured: boolean;
    }[];
  };
  id: string;
  state: string;
  created_at: string;
  error?: string;
  duration_ms?: number;
  downloadable: boolean;
  can_repair?: boolean;
  repair_of?: string;
  model?: string;
  review?: {
    externalReview?: {
      status: string;
      generationId: string;
      source: string;
      notes: string[];
    };
    bulletAudit?: Array<{
      sourceId: string;
      bulletIndex: number;
      decision: string;
      reason: string;
      replacementEvidenceIds: string[];
    }>;
    artifactValidation?: {
      pages: number;
      textVerified: boolean;
      checkedBlocks: number;
    };
    approved: boolean;
    issues: Array<{
      severity: string;
      section: string;
      problem: string;
      fix: string;
    }>;
    strengths: string[];
    missingRequirements: string[];
    questionsForCandidate: string[];
  };
  cv?: {
    layoutVersion?: string;
    studies?: string[];
    name: string;
    summary: string;
    skills: string[];
    experiences: Array<{
      role: string;
      company: string;
      period: string;
      bullets: string[];
      technologies?: string[];
    }>;
  };
};

export type Job = {
  id: string;
  title: string;
  company: string;
  url?: string;
  description: string;
  language: "pt-BR" | "en";
  saved_at: string;
  applied_at?: string;
  applied_generation_id?: string;
  generation_state: string;
  generation_error?: string;
  version_count: number;
  generations?: Generation[];
};

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await r.json();

  if (!r.ok) throw new Error(body.error ?? "Could not complete the operation.");

  return body;
}

export const stateLabels: Record<string, string> = {
  queued: "Queued",
  importing: "Reading description",
  generating: "Writing CV",
  reviewing: "Reviewing",
  ready: "Ready",
  needs_input: "Description needed",
  needs_review: "Needs review",
  failed: "Failed",
};

export const isBusy = (state?: string) =>
  ["queued", "importing", "generating", "reviewing"].includes(state ?? "");
