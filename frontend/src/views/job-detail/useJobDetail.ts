import { useEffect, useRef, useState } from "react";
import { api, type Job } from "../../lib/api";
import { initialJob } from "../../lib/job-form";

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Could not load job.";

export function useJobDetail(
  selected: string | undefined,
  setError: (message: string) => void,
) {
  const [detail, setDetail] = useState<Job>();
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(initialJob);
  const [applicationDate, setApplicationDate] = useState("");
  const [applicationVersion, setApplicationVersion] = useState("");
  const [version, setVersion] = useState("");
  const selectedRef = useRef(selected);

  selectedRef.current = selected;

  useEffect(() => {
    if (!selected) {
      setDetail(undefined);

      return;
    }

    let stopped = false;
    let initialized = false;

    setDetail(undefined);
    setEditing(false);
    setVersion("");
    setApplicationDate("");
    setApplicationVersion("");
    const load = () =>
      api<Job>(`/jobs/${selected}`)
        .then((v) => {
          if (!stopped) {
            setDetail(v);

            if (!initialized) {
              initialized = true;
              setApplicationDate(
                v.applied_at
                  ? new Date(v.applied_at).toLocaleDateString("en-CA")
                  : "",
              );

              setApplicationVersion(v.applied_generation_id ?? "");
            }
          }
        })
        .catch((e) => {
          if (!stopped) setError(message(e));
        });

    void load();
    const timer = setInterval(() => void load(), 3000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [selected]);

  const current =
    detail?.generations?.find((g) => g.id === version) ??
    detail?.generations?.[0];

  async function reloadDetail(id: string) {
    const value = await api<Job>(`/jobs/${id}`);

    if (selectedRef.current === id) setDetail(value);
  }

  function beginEdit() {
    if (!detail) return;
    setEdit({
      title: detail.title,
      company: detail.company,
      url: detail.url ?? "",
      description: detail.description,
      language: detail.language,
    });

    setEditing(true);
  }

  return {
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
  };
}
