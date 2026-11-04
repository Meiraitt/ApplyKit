import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { RefreshCw } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { JobCards } from "../../components/jobs/JobCards";

export function JobsView() {
  const { jobs, refresh, loading, openJob, tab } = useWorkspace();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = jobs.filter(
    (j) =>
      (filter === "all" ||
        (filter === "applied" && j.applied_at) ||
        (filter === "pending" && !j.applied_at) ||
        (filter === "ready" && j.generation_state === "ready")) &&
      `${j.title} ${j.company}`.toLowerCase().includes(search.toLowerCase()),
  );

  return tab === "jobs" ? (
    <>
      <div className="flex w-full flex-wrap gap-3 [&_input]:m-0 [&_input]:basis-full [&_select]:m-0 [&_select]:w-0 [&_select]:flex-1 desktop:flex-nowrap desktop:[&_input]:max-w-[420px] desktop:[&_select]:w-auto desktop:[&_select]:flex-none">
        <input
          aria-label="Search jobs"
          placeholder="Search job title or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter jobs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All jobs</option>
          <option value="pending">Not applied</option>
          <option value="applied">Applied</option>
          <option value="ready">CV ready</option>
        </select>
        <Button
          variant="quiet"
          onClick={() => void refresh()}
          aria-label="Refresh jobs"
        >
          <RefreshCw size={17} />
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted my-4">
        {visible.length} {visible.length === 1 ? "job" : "jobs"}
      </p>
      <JobCards jobs={visible} loading={loading} onOpen={openJob} />
    </>
  ) : null;
}
