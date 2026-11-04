import { Button } from "../ui/Button";
import { FileText, FolderOpen, LayoutDashboard, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { tab, setTab, jobs, active, profile, selected, error, notice } =
    useWorkspace();

  return (
    <div className="min-h-dvh w-full min-w-0 desktop:flex">
      <aside className="flex w-full flex-col border-b border-line bg-[#121618] p-4 tablet:flex-row tablet:items-center tablet:gap-7 tablet:px-6 desktop:fixed desktop:inset-y-0 desktop:left-0 desktop:w-56 desktop:flex-col desktop:items-stretch desktop:gap-0 desktop:border-r desktop:border-b-0 desktop:px-4 desktop:pt-8 desktop:pb-5">
        <a
          className="mb-4 flex items-center gap-2.5 text-[22px] font-semibold tracking-tight tablet:mb-0 desktop:mb-10 desktop:px-3 desktop:text-[25px] [&_svg]:text-accent"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("dashboard");
          }}
        >
          <FileText size={21} />
          ApplyKit<span className="text-accent">/</span>
        </a>
        <span className="mx-3 mb-3 hidden text-[10px] tracking-[1.6px] text-[#7e898d] desktop:block">
          PERSONAL
        </span>
        <nav
          className="grid w-full grid-cols-3 gap-1 tablet:flex tablet:justify-end desktop:grid desktop:grid-cols-1"
          aria-label="Main navigation"
        >
          <button
            className={
              tab === "dashboard"
                ? "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0 !bg-[#24322c] !text-[#b5d8c2]"
                : "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0"
            }
            onClick={() => setTab("dashboard")}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button
            className={
              tab === "jobs"
                ? "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0 !bg-[#24322c] !text-[#b5d8c2]"
                : "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0"
            }
            onClick={() => setTab("jobs")}
          >
            <FolderOpen size={18} />
            My jobs
            <span className="ml-auto hidden text-xs text-muted desktop:inline">
              {jobs.length}
            </span>
          </button>
          <button
            className={
              tab === "new"
                ? "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0 !bg-[#24322c] !text-[#b5d8c2]"
                : "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[5px] bg-transparent px-1 py-2.5 text-left text-[11px] text-muted hover:bg-[#202628] hover:text-white tablet:gap-2 tablet:px-3 tablet:text-[13px] desktop:justify-start [&_svg]:shrink-0"
            }
            onClick={() => setTab("new")}
          >
            <Plus size={18} />
            New job
          </button>
        </nav>
        <div className="mt-auto hidden desktop:block">
          <span className="flex items-center gap-2 text-xs text-muted pl-2.5">
            <span
              className={
                active
                  ? "inline-block size-1.5 rounded-full bg-[#85bd9c] !bg-[#dbbd79]"
                  : "inline-block size-1.5 rounded-full bg-[#85bd9c]"
              }
            />
            {active ? `${active} processing` : "Queue idle"}
          </span>
          <div className="mt-5 flex items-center gap-2.5 border-t border-line pt-5 [&_strong]:block [&_strong]:text-[11px] [&_strong]:font-medium [&_small]:mt-1 [&_small]:block [&_small]:text-[10px]">
            <span className="rounded-[5px] border border-[#46534c] bg-[#27332d] p-2 text-[11px] text-[#c4d4ca]">
              {profile?.name
                ?.split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("") || "CV"}
            </span>
            <div>
              <strong>{profile?.name ?? "My profile"}</strong>
              <small>Local source profile</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 desktop:ml-56">
        <header className="hidden h-16 items-center justify-between border-b border-line px-9 text-xs text-muted desktop:flex">
          <span>
            Personal <span className="mx-2.5 text-[#677276]">/</span>{" "}
            {tab === "dashboard"
              ? "Overview"
              : tab === "jobs"
                ? "My jobs"
                : "New job"}
          </span>
          <span className="text-[11px] text-[#879396]">Local storage</span>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-[1400px] px-4 pt-6 pb-10 tablet:px-6 tablet:py-7 desktop:px-9 desktop:pt-9 desktop:pb-15">
          <div className="mb-7 flex flex-wrap items-start justify-between gap-3 tablet:items-center tablet:gap-5 [&>div]:min-w-0 [&>div]:flex-[1_1_220px]">
            <div>
              <h1>
                {tab === "dashboard"
                  ? "Overview"
                  : tab === "jobs"
                    ? "My jobs"
                    : "New job"}
              </h1>
              <p className="mb-0 text-xs text-muted desktop:text-[13px]">
                {tab === "dashboard"
                  ? "Track your jobs and applications."
                  : tab === "jobs"
                    ? "Open a job to view its description, CVs and application."
                    : "Add a job to generate a CV from your profile."}
              </p>
            </div>
            {tab !== "new" && (
              <Button variant="primary" onClick={() => setTab("new")}>
                <Plus size={16} />
                Add job
              </Button>
            )}
          </div>
          {!selected && error && (
            <div
              role="alert"
              className="mb-5 rounded-[5px] border px-4 py-3 text-xs leading-relaxed border-[#6c4549] bg-[#39282a] text-[#efbcc0]"
            >
              {error}
            </div>
          )}
          {!selected && notice && (
            <div
              role="status"
              className="mb-5 rounded-[5px] border px-4 py-3 text-xs leading-relaxed border-[#42694f] bg-[#25372d] text-[#b5d7bd]"
            >
              {notice}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
