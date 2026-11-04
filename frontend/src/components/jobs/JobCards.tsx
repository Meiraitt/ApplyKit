import { ArrowUpRight, Check, FolderOpen } from "lucide-react";
import type { Job } from "../../lib/api";
import { date } from "../../lib/date";
import { Badge } from "./Badge";

export function JobCards({
  jobs,
  loading,
  onOpen,
}: {
  jobs: Job[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section
      className="grid grid-cols-1 gap-3.5 tablet:grid-cols-2 min-[75rem]:grid-cols-3"
      aria-label="Job list"
    >
      {loading ? (
        <p className="col-span-full rounded-md border border-dashed border-line px-5 py-10 text-center text-muted [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[#d6ddda] [&_p]:mb-0">
          Loading jobs…
        </p>
      ) : jobs.length ? (
        jobs.map((j) => (
          <button
            key={j.id}
            className="flex min-w-0 flex-col rounded-lg border border-line bg-panel px-5 py-4.5 text-left transition-colors hover:border-[#667c70] hover:bg-[#232b2c] [&_h3]:mb-4.5 [&_h3]:line-clamp-2 [&_h3]:text-[15px] [&_h3]:leading-relaxed [&_h3]:wrap-anywhere"
            onClick={() => onOpen(j.id)}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-[#98a4a6]">
              <span className="truncate text-[11px]">
                {j.company || "Company not specified"}
              </span>
              <ArrowUpRight size={16} />
            </div>
            <h3>{j.title}</h3>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <Badge state={j.generation_state} />
              {j.applied_at && (
                <span className="flex items-center gap-1 text-[10px] text-[#acd5ba]">
                  <Check size={12} />
                  Applied
                </span>
              )}
            </div>
            <div className="mt-5 flex justify-between border-t border-line pt-3 text-[11px] text-[#94a0a3]">
              <span>{date(j.saved_at)}</span>
              <span>
                {j.version_count}{" "}
                {j.version_count === 1 ? "version" : "versions"}
              </span>
            </div>
          </button>
        ))
      ) : (
        <div className="col-span-full rounded-md border border-dashed border-line px-5 py-10 text-center text-muted [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[#d6ddda] [&_p]:mb-0">
          <FolderOpen size={24} />
          <h3>No jobs here yet</h3>
          <p>Add an opportunity or adjust the filters.</p>
        </div>
      )}
    </section>
  );
}
