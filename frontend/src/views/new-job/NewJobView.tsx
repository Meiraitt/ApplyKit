import { useState } from "react";
import { initialJob } from "../../lib/job-form";
import { api, type Job } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { ArrowUpRight, Send } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";

export function NewJobView() {
  const { action, openJob, setNotice, sending, tab } = useWorkspace();
  const [input, setInput] = useState(initialJob);

  async function submit() {
    await action(async () => {
      const result = await api<{ vacancy: Job; duplicate: boolean }>("/jobs", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setInput(initialJob);
      openJob(result.vacancy.id);
      setNotice(
        result.duplicate
          ? "This job is already saved. You can generate another version."
          : "Job saved. Your CV is queued.",
      );
    });
  }

  return tab === "new" ? (
    <div className="grid grid-cols-1 gap-8 min-[75rem]:grid-cols-[minmax(0,760px)_minmax(220px,1fr)]">
      <section className="min-w-0 max-w-full rounded-lg border border-line bg-panel p-4.5 desktop:p-6.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Job URL <span>optional</span>
            <input
              type="url"
              value={input.url}
              onChange={(e) => setInput({ ...input, url: e.target.value })}
              placeholder="https://www.linkedin.com/…"
            />
          </label>
          <label>
            Job description
            <textarea
              rows={8}
              value={input.description}
              onChange={(e) =>
                setInput({ ...input, description: e.target.value })
              }
              placeholder="Paste the responsibilities, requirements and context for this job."
            />
          </label>
          <p className="text-xs leading-relaxed text-muted">
            Enter a URL or a description of at least 80 characters. If both are
            provided, the description takes priority.
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-0 tablet:grid-cols-2 tablet:gap-5 [&>*]:min-w-0">
            <label>
              Job title <span>optional</span>
              <input
                value={input.title}
                onChange={(e) => setInput({ ...input, title: e.target.value })}
                placeholder="e.g. Frontend Developer"
              />
            </label>
            <label>
              Company <span>optional</span>
              <input
                value={input.company}
                onChange={(e) =>
                  setInput({ ...input, company: e.target.value })
                }
                placeholder="Company name"
              />
            </label>
          </div>
          <label className="max-w-[220px]">
            CV language
            <select
              value={input.language}
              onChange={(e) =>
                setInput({
                  ...input,
                  language: e.target.value as "pt-BR" | "en",
                })
              }
            >
              <option value="pt-BR">Portuguese</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="flex flex-col items-stretch justify-between gap-4 border-t border-line pt-5 tablet:flex-row tablet:items-center [&>span]:text-[11px] [&>span]:text-muted">
            <span>PDF and DOCX after review</span>
            <Button
              variant="primary"
              disabled={
                sending || (!input.url && input.description.trim().length < 80)
              }
            >
              {sending ? "Saving…" : "Save and generate CV"}
              <ArrowUpRight size={16} />
            </Button>
          </div>
        </form>
      </section>
      <aside className="max-w-[600px] py-1.5 text-xs text-muted [&_h3]:text-[#d7dfda] [&_ol]:list-decimal [&_ol]:pl-4.5 [&_ol]:leading-relaxed [&_li]:mb-3.5 [&_li]:pl-1">
        <h3>How it works</h3>
        <ol>
          <li>The job is saved and queued.</li>
          <li>A CV is written from your profile and reviewed.</li>
          <li>Approved versions become available for download.</li>
        </ol>
        <p>
          Pages requiring login or blocking access may need a pasted
          description.
        </p>
        <div className="mt-6 flex gap-3 border-t border-line pt-5 [&_svg]:shrink-0 [&_svg]:text-accent [&_strong]:font-medium [&_strong]:text-[#d7dfda] [&_p]:my-2.5 [&_small]:block [&_small]:text-[11px] [&_small]:leading-relaxed">
          <Send size={18} />
          <div>
            <strong>Also on Telegram</strong>
            <p>Open the menu and tap New job. Commands are also available.</p>
            <small>
              While the app is offline, Telegram retains pending updates for up
              to 24 hours.
            </small>
          </div>
        </div>
      </aside>
    </div>
  ) : null;
}
