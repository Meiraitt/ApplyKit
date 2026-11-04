import { ButtonLink, Button } from "../../components/ui/Button";
import { ArrowUpRight, FileText, RefreshCw } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { Badge } from "../../components/jobs/Badge";
import { Drawer } from "../../components/ui/Drawer";
import { api, isBusy, stateLabels } from "../../lib/api";
import { date } from "../../lib/date";
import { ApplicationForm } from "./components/ApplicationForm";
import { CvPanel } from "./components/CvPanel";
import { DeleteJob } from "./components/DeleteJob";
import { DescriptionEditor } from "./components/DescriptionEditor";

export function JobDetailView() {
  const {
    selected,
    setSelected,
    detail,
    setDetail,
    error,
    notice,
    sending,
    action,
    reloadDetail,
    setVersion,
    setNotice,
    current,
  } = useWorkspace();

  return (
    <>
      {selected && (
        <Drawer onClose={() => setSelected(undefined)}>
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-[5px] border px-4 py-3 text-xs leading-relaxed border-[#6c4549] bg-[#39282a] text-[#efbcc0]"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="mb-5 rounded-[5px] border px-4 py-3 text-xs leading-relaxed border-[#42694f] bg-[#25372d] text-[#b5d7bd]"
            >
              {notice}
            </div>
          )}
          <section className="min-w-0 max-w-full rounded-lg border border-line bg-panel !border-0 !bg-transparent !p-0 [&_details]:my-3.5 [&_details]:rounded-[5px] [&_details]:border [&_details]:border-line [&_details]:p-3 [&_details[open]>summary]:mb-4">
            {!selected ? (
              <div className="col-span-full rounded-md border border-dashed border-line px-5 py-10 text-center text-muted [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[#d6ddda] [&_p]:mb-0">
                <FileText size={32} />
                <h2>Select an opportunity</h2>
                <p>View the description, CVs and your application.</p>
              </div>
            ) : !detail ? (
              <div className="col-span-full rounded-md border border-dashed border-line px-5 py-10 text-center text-muted [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[#d6ddda] [&_p]:mb-0">
                Loading details...
              </div>
            ) : (
              <>
                <div className="mb-5 [&_h2]:mb-3.5 [&_h2]:text-[21px] [&_h2]:leading-snug tablet:[&_h2]:text-[23px]">
                  <p className="mb-2 text-[11px] text-muted">
                    {detail.company || "OPPORTUNITY"}
                  </p>
                  <h2>{detail.title}</h2>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Badge state={detail.generations?.[0]?.state ?? ""} />
                    <small>Saved on {date(detail.saved_at)}</small>
                  </div>
                </div>
                <div className="mb-6 grid grid-cols-2 gap-2.5 tablet:flex tablet:flex-wrap [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:whitespace-normal">
                  {detail.url && (
                    <ButtonLink
                      variant="secondary"
                      href={detail.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open posting
                      <ArrowUpRight size={15} />
                    </ButtonLink>
                  )}
                  <Button
                    variant="secondary"
                    disabled={sending || isBusy(detail.generations?.[0]?.state)}
                    onClick={() =>
                      void action(async () => {
                        await api(`/jobs/${detail.id}/generate`, {
                          method: "POST",
                        });

                        await reloadDetail(detail.id);
                        setVersion("");
                      })
                    }
                  >
                    <RefreshCw size={15} />
                    Generate new version
                  </Button>
                </div>
                {isBusy(detail.generations?.[0]?.state) && (
                  <div className="flex items-center gap-3 rounded-[5px] border border-[#485247] bg-[#293126] p-4 text-xs [&_p]:mt-1.5 [&_p]:mb-0 [&_p]:text-muted">
                    <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-[#63765e] border-t-[#d3dbbc] motion-reduce:animate-none" />
                    <div>
                      <strong>
                        {stateLabels[detail.generations![0].state]}
                      </strong>
                      <p>
                        You can add more jobs. This view updates automatically.
                      </p>
                    </div>
                  </div>
                )}
                {detail.generations?.[0]?.error && (
                  <div className="mb-5 rounded-[5px] border px-4 py-3 text-xs leading-relaxed border-[#6c4549] bg-[#39282a] text-[#efbcc0]">
                    {detail.generations[0].error}
                  </div>
                )}
                <DescriptionEditor />
                <div className="mb-4.5 flex flex-wrap items-center justify-between gap-4 [&_h3]:m-0 [&_p]:mt-2 [&_p]:mb-0 [&_select]:m-0 [&_select]:w-auto [&_select]:min-h-10 [&_select]:p-2 [&_select]:text-[13px]">
                  <h3>CVs and review</h3>
                </div>
                {detail.generations?.length ? (
                  <>
                    <label className="mb-5">
                      Version
                      <select
                        value={current?.id ?? ""}
                        onChange={(e) => setVersion(e.target.value)}
                      >
                        {detail.generations.map((g, i) => (
                          <option key={g.id} value={g.id}>
                            Version {detail.generations!.length - i} ·{" "}
                            {date(g.created_at)} · {stateLabels[g.state]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {current && (
                      <CvPanel
                        generation={current}
                        busy={sending || isBusy(detail.generations?.[0]?.state)}
                        onRepair={() =>
                          void action(async () => {
                            const result = await api<{ generationId: string }>(
                              `/jobs/${detail.id}/repair`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  generationId: current.id,
                                }),
                              },
                            );

                            await reloadDetail(detail.id);
                            setVersion(result.generationId);
                            setNotice(
                              "Revision queued. The reviewer will check the revised CV before releasing the files.",
                            );
                          })
                        }
                      />
                    )}
                  </>
                ) : (
                  <p>No CV generated yet.</p>
                )}
                <ApplicationForm />
                <DeleteJob
                  key={detail.id}
                  title={detail.title}
                  busy={sending || isBusy(detail.generations?.[0]?.state)}
                  onDelete={() =>
                    void action(async () => {
                      const result = await api<{
                        deleted: boolean;
                        cleanupPending: boolean;
                      }>(`/jobs/${detail.id}`, { method: "DELETE" });

                      setSelected(undefined);
                      setDetail(undefined);
                      setNotice(
                        result.cleanupPending
                          ? "Job deleted from the database. Some local files could not be removed."
                          : "Job and CVs deleted.",
                      );
                    })
                  }
                />
              </>
            )}
          </section>
        </Drawer>
      )}
    </>
  );
}
