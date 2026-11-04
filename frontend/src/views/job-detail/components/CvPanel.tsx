import { Button, ButtonLink } from "../../../components/ui/Button";
import { Download, RefreshCw } from "lucide-react";
import type { Generation } from "../../../lib/api";

export function CvPanel({
  generation: g,
  busy,
  onRepair,
}: {
  generation: Generation;
  busy: boolean;
  onRepair: () => void;
}) {
  const issues = g.review?.issues ?? [],
    blocking = issues.filter((i) => i.severity === "blocking");

  return (
    <div className="min-w-0 max-w-full text-xs [&_li]:my-2 [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5">
      {g.repair_of && (
        <p className="text-xs leading-relaxed text-muted">
          Revision of version {g.repair_of.slice(0, 8)}. The previous version
          remains in the history.
        </p>
      )}
      {g.state === "needs_review" && (
        <section
          className="my-4.5 rounded-md border border-[#736043] bg-[#292820] p-4.5 [&_h3]:text-[#ecd2a4] [&>button]:min-h-11 [&>button]:whitespace-normal"
          aria-label="CV issues"
        >
          <h3>
            {blocking.length
              ? `${blocking.length} ${blocking.length === 1 ? "required change" : "required changes"}`
              : "Review pending"}
          </h3>
          <p>
            This CV is awaiting approval. Review the passages and corrections
            identified below.
          </p>
          {issues.map((issue, index) => (
            <article
              className="my-4 border-l-2 border-[#a19470] pl-3 text-xs wrap-anywhere [&_p]:my-1"
              key={index}
            >
              <strong>
                {issue.severity === "blocking"
                  ? "Required change"
                  : "Suggestion"}{" "}
                · {issue.section}
              </strong>
              <p>
                <b>Problem: </b>
                {issue.problem}
              </p>
              <p>
                <b>How to fix: </b>
                {issue.fix}
              </p>
            </article>
          ))}
          {g.can_repair ? (
            <>
              <Button variant="primary" disabled={busy} onClick={onRepair}>
                <RefreshCw size={16} />
                Revise with feedback
              </Button>
              <p className="text-xs leading-relaxed text-muted">
                Uses this draft, feedback and saved facts. Revises the affected
                passages and runs the review again.
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              This version is missing the data needed to resume revision.
              Generate a new version.
            </p>
          )}
        </section>
      )}
      {g.downloadable && (
        <div className="mb-6 grid grid-cols-2 gap-2.5 tablet:flex tablet:flex-wrap [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:whitespace-normal">
          <ButtonLink
            download
            variant="primary"
            href={`/api/generations/${g.id}/pdf`}
          >
            <Download size={16} />
            Download PDF
          </ButtonLink>
          <ButtonLink
            download
            variant="secondary"
            href={`/api/generations/${g.id}/docx`}
          >
            <Download size={16} />
            Download DOCX
          </ButtonLink>
        </div>
      )}
      {g.cv && (
        <details>
          <summary>Content preview</summary>
          <div className="text-[13px] leading-relaxed text-[#c5ceca] [&_h4]:mb-1">
            <h3>{g.cv.name}</h3>
            <p>{g.cv.summary}</p>
            {!g.cv.layoutVersion && (
              <p>
                <strong>{g.cv.skills.join(" · ")}</strong>
              </p>
            )}
            {g.cv.experiences.map((e, i) => (
              <div key={i}>
                <h4>
                  {e.role} - {e.company}
                </h4>
                <small>{e.period}</small>
                <ul>
                  {e.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
                {!!e.technologies?.length && (
                  <p>Technologies used: {e.technologies.join(" · ")}</p>
                )}
              </div>
            ))}
            {!!g.cv.studies?.length && (
              <>
                <h4>Skills</h4>
                <p>{g.cv.studies.join(" · ")}</p>
              </>
            )}
          </div>
        </details>
      )}
      {g.review && (
        <details>
          <summary>Full review report</summary>
          <p className="text-xs leading-relaxed text-muted">
            Assessment of writing and fidelity to the profile. This is not an
            external ATS score.
          </p>
          {g.state !== "needs_review" &&
            issues.map((i, n) => (
              <div
                className="my-4 border-l-2 border-[#a19470] pl-3 text-xs wrap-anywhere [&_p]:my-1"
                key={n}
              >
                <strong>
                  {i.severity === "blocking" ? "Required change" : "Suggestion"}{" "}
                  · {i.section}
                </strong>
                <p>{i.problem}</p>
                <p>{i.fix}</p>
              </div>
            ))}
          {!issues.length && <p>No changes requested in this review.</p>}
          {g.review.externalReview?.generationId === g.id && (
            <section className="my-4 border-l-2 border-[#a19470] pl-3 text-xs wrap-anywhere [&_p]:my-1">
              <h4>External review of this version</h4>
              <p>
                {g.review.externalReview.status === "ready"
                  ? "Content approved in the browser chat."
                  : g.review.externalReview.status === "ready_with_reservation"
                    ? "Content reviewed with a recorded reservation."
                    : "The chat requested changes to this version."}
              </p>
              {g.review.externalReview.notes.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
            </section>
          )}
          {g.review.artifactValidation?.textVerified && (
            <p className="text-xs leading-relaxed text-muted">
              PDF verified: {g.review.artifactValidation.pages} page(s), with
              extracted text compared against the approved content.
            </p>
          )}
          {!!g.review.bulletAudit?.length && (
            <>
              <h4>Bullet-by-bullet review</h4>
              {g.review.bulletAudit.map((a, i) => (
                <div
                  className="my-4 border-l-2 border-[#a19470] pl-3 text-xs wrap-anywhere [&_p]:my-1"
                  key={i}
                >
                  <strong>
                    {a.sourceId} · Bullet {a.bulletIndex + 1} ·{" "}
                    {a.decision === "keep" ? "Keep" : "Suggested replacement"}
                  </strong>
                  <p>{a.reason}</p>
                  {!!a.replacementEvidenceIds.length && (
                    <p>
                      Suggested evidence: {a.replacementEvidenceIds.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
          {!!g.review.strengths.length && (
            <>
              <h4>Strengths</h4>
              <ul>
                {g.review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {!!g.review.missingRequirements.length && (
            <>
              <h4>Gaps and unverified requirements</h4>
              <p className="text-xs leading-relaxed text-muted">
                These are application gaps. They must not be filled with
                invented claims.
              </p>
              <ul>
                {g.review.missingRequirements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {!!g.review.questionsForCandidate.length && (
            <>
              <h4>Questions to enrich your profile</h4>
              <ul>
                {g.review.questionsForCandidate.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {g.token_usage && (
        <details>
          <summary>Token usage</summary>
          <p>
            {g.token_usage.totalTokens.toLocaleString("en-US")} tokens ·{" "}
            {g.token_usage.measured
              ? "reported by provider"
              : "includes text estimates (excluding provider overhead)"}
          </p>
          <p>
            Input: {g.token_usage.inputTokens.toLocaleString("en-US")} · Output:{" "}
            {g.token_usage.outputTokens.toLocaleString("en-US")}
          </p>
          <p>
            Cached input:{" "}
            {g.token_usage.cachedInputTokens.toLocaleString("en-US")} (already
            included in input).
          </p>
          <ul>
            {g.token_usage.calls.map((call, i) => (
              <li key={i}>
                {call.role === "writer" ? "Writing / revision" : "Review"}:{" "}
                {(call.inputTokens + call.outputTokens).toLocaleString("en-US")}{" "}
                tokens{call.measured ? "" : " (estimated)"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {g.duration_ms && (
        <p className="text-xs leading-relaxed text-muted">
          Generated in {Math.round(g.duration_ms / 1000)}s · {g.model}
        </p>
      )}
    </div>
  );
}
