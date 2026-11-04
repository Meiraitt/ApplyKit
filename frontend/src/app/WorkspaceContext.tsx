import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, isBusy, type Job } from "../lib/api";
import { useDashboard } from "../views/dashboard/useDashboard";
import { useJobDetail } from "../views/job-detail/useJobDetail";

function useWorkspaceState() {
  const [tab, setTab] = useState<"dashboard" | "new" | "jobs">("dashboard");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string>();
  const [profile, setProfile] = useState<{
    name: string;
    headline: string;
    notes: string;
  }>();
  const [error, setError] = useState("");
  const { dashboard, weeks, setWeeks } = useDashboard(setError);
  const {
    detail,
    setDetail,
    editing,
    setEditing,
    edit,
    setEdit,
    applicationDate,
    setApplicationDate,
    applicationVersion,
    setApplicationVersion,
    version,
    setVersion,
    current,
    reloadDetail,
    beginEdit,
  } = useJobDetail(selected, setError);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function refresh() {
    try {
      const list = await api<Job[]>("/jobs");

      setJobs(list);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    api<typeof profile>("/profile")
      .then(setProfile)
      .catch(() => {});

    const timer = setInterval(() => void refresh(), 3000);

    return () => clearInterval(timer);
  }, []);

  const active = jobs.filter((j) => isBusy(j.generation_state)).length;

  async function action(fn: () => Promise<void>) {
    setSending(true);
    setError("");
    setNotice("");

    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setSending(false);
    }
  }

  function openJob(id: string) {
    setSelected(id);
    setNotice("");
  }

  async function apply(appliedAt: string | null) {
    if (!detail) return;
    const id = detail.id;

    await action(async () => {
      await api(`/jobs/${id}/application`, {
        method: "PATCH",
        body: JSON.stringify({
          appliedAt,
          generationId:
            applicationVersion ||
            detail.generations?.find((g) => g.downloadable)?.id ||
            null,
        }),
      });

      await reloadDetail(id);
      setNotice(appliedAt ? "Application recorded." : "Application unmarked.");
    });
  }

  return {
    tab,
    setTab,
    jobs,
    setJobs,
    selected,
    setSelected,
    detail,
    setDetail,
    dashboard,
    weeks,
    setWeeks,
    profile,
    setProfile,
    error,
    setError,
    notice,
    setNotice,
    loading,
    setLoading,
    sending,
    setSending,
    editing,
    setEditing,
    edit,
    setEdit,
    applicationDate,
    setApplicationDate,
    applicationVersion,
    setApplicationVersion,
    version,
    setVersion,
    refresh,
    active,
    current,
    action,
    reloadDetail,
    openJob,
    beginEdit,
    apply,
  };
}

const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(
  null,
);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace() {
  const value = useContext(Context);

  if (!value) throw new Error("Missing WorkspaceProvider");

  return value;
}

function message(e: unknown) {
  return e instanceof Error ? e.message : "Could not complete the action.";
}
