import { WorkspaceProvider } from "./app/WorkspaceContext";
import { AppShell } from "./components/layout/AppShell";
import { DashboardView } from "./views/dashboard/DashboardView";
import { JobDetailView } from "./views/job-detail/JobDetailView";
import { JobsView } from "./views/jobs/JobsView";
import { NewJobView } from "./views/new-job/NewJobView";

export function App() {
  return (
    <WorkspaceProvider>
      <AppShell>
        <DashboardView />
        <JobsView />
        <NewJobView />
      </AppShell>
      <JobDetailView />
    </WorkspaceProvider>
  );
}
