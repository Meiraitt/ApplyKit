import { Button } from "../../../components/ui/Button";
import { useWorkspace } from "../../../app/WorkspaceContext";
import { api, isBusy } from "../../../lib/api";

export function DescriptionEditor() {
  const {
    detail,
    beginEdit,
    editing,
    edit,
    setEdit,
    sending,
    action,
    reloadDetail,
    setEditing,
    setNotice,
  } = useWorkspace();

  if (!detail) return null;

  return (
    <>
      <div className="mb-4.5 flex flex-wrap items-center justify-between gap-4 [&_h3]:m-0 [&_p]:mt-2 [&_p]:mb-0 [&_select]:m-0 [&_select]:w-auto [&_select]:min-h-10 [&_select]:p-2 [&_select]:text-[13px]">
        <h3>Job description</h3>
        <Button
          variant="text"
          disabled={isBusy(detail.generations?.[0]?.state)}
          onClick={beginEdit}
        >
          Edit description
        </Button>
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api(`/jobs/${detail.id}`, {
                method: "PATCH",
                body: JSON.stringify(edit),
              });

              await reloadDetail(detail.id);
              setEditing(false);
              setNotice("Description saved. Generate a new version to use it.");
            });
          }}
        >
          <label>
            Job title
            <input
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
          </label>
          <label>
            Company
            <input
              value={edit.company}
              onChange={(e) => setEdit({ ...edit, company: e.target.value })}
            />
          </label>
          <label>
            Full description
            <textarea
              rows={10}
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <label>
            Language
            <select
              value={edit.language}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  language: e.target.value as "pt-BR" | "en",
                })
              }
            >
              <option value="pt-BR">Portuguese</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="mb-6 grid grid-cols-2 gap-2.5 tablet:flex tablet:flex-wrap [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:whitespace-normal">
            <Button
              variant="primary"
              disabled={sending || edit.description.trim().length < 80}
            >
              Save description
            </Button>
            <Button
              variant="quiet"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <details>
          <summary>View full description</summary>
          <p className="text-[13px] whitespace-pre-wrap wrap-anywhere text-[#bbc5c5]">
            {detail.description ||
              "Waiting for a description. Use “Edit description” to paste the text."}
          </p>
        </details>
      )}
    </>
  );
}
