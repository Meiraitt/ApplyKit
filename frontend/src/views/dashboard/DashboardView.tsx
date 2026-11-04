import { Button } from "../../components/ui/Button";
import { ArrowUpRight } from "lucide-react";
import { lazy, Suspense } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { JobCards } from "../../components/jobs/JobCards";

const Dashboard = lazy(() =>
  import("./components/WeeklyActivity").then((m) => ({ default: m.Dashboard })),
);

export function DashboardView() {
  const { dashboard, weeks, setWeeks, setTab, jobs, loading, openJob, tab } =
    useWorkspace();

  return tab === "dashboard" ? (
    <>
      <Suspense fallback={<p>Loading overview.</p>}>
        <Dashboard data={dashboard} weeks={weeks} onWeeks={setWeeks} />
      </Suspense>
      <div className="mb-4.5 flex flex-wrap items-center justify-between gap-4 [&_h3]:m-0 [&_p]:mt-2 [&_p]:mb-0 [&_select]:m-0 [&_select]:w-auto [&_select]:min-h-10 [&_select]:p-2 [&_select]:text-[13px] !mt-8 !mb-4">
        <h2>Recent jobs</h2>
        <Button variant="text" onClick={() => setTab("jobs")}>
          View all <ArrowUpRight size={14} />
        </Button>
      </div>
      <JobCards jobs={jobs.slice(0, 3)} loading={loading} onOpen={openJob} />
    </>
  ) : null;
}
