import { Button } from "../../../components/ui/Button";
import { Check } from "lucide-react";
import { useWorkspace } from "../../../app/WorkspaceContext";
import { date } from "../../../lib/date";

export function ApplicationForm() {
  const {
    detail,
    sending,
    applicationDate,
    setApplicationDate,
    applicationVersion,
    setApplicationVersion,
    apply,
  } = useWorkspace();

  if (!detail) return null;

  return (
    <>
      <form
        className="mt-7 border-t border-line pt-6 [&_p]:text-xs [&_p]:text-muted"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get(
            "applicationDate",
          );

          void apply(
            value
              ? new Date(`${value}T00:00:00`).toISOString()
              : new Date().toISOString(),
          );
        }}
      >
        <h3>Your application</h3>
        <p>
          {detail.applied_at
            ? `Applied on ${date(detail.applied_at)}${detail.applied_generation_id ? " · linked CV" : ""}`
            : "You have not marked this job as applied."}
        </p>
        <label>
          Application date
          <input
            type="date"
            name="applicationDate"
            value={applicationDate}
            max={new Date().toLocaleDateString("en-CA")}
            onChange={(e) => setApplicationDate(e.target.value)}
            onInput={(e) => setApplicationDate(e.currentTarget.value)}
          />
        </label>
        <label>
          Submitted CV
          <select
            value={applicationVersion}
            onChange={(e) => setApplicationVersion(e.target.value)}
          >
            <option value="">Latest approved CV</option>
            {detail.generations
              ?.filter((g) => g.downloadable)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {date(g.created_at)} · {g.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
        <div className="mb-6 grid grid-cols-2 gap-2.5 tablet:flex tablet:flex-wrap [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:whitespace-normal">
          <Button variant="primary" disabled={sending} type="submit">
            <Check size={16} />
            {detail.applied_at ? "Update application" : "Mark as applied"}
          </Button>
          {detail.applied_at && (
            <Button
              variant="quiet"
              type="button"
              disabled={sending}
              onClick={() => void apply(null)}
            >
              Unmark
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
