import { Button } from "../../../components/ui/Button";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function DeleteJob({
  title,
  busy,
  onDelete,
}: {
  title: string;
  busy: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      className="mt-7.5 border-t border-line pt-5 [&_p]:text-xs [&_p]:text-muted"
      aria-label="Delete job"
    >
      {confirming ? (
        <>
          <h3>Delete “{title}”?</h3>
          <p>
            The job, CVs and application record will be removed. This action
            cannot be undone.
          </p>
          <div className="mb-6 grid grid-cols-2 gap-2.5 tablet:flex tablet:flex-wrap [&>*]:min-h-11 [&>*]:min-w-0 [&>*]:whitespace-normal">
            <Button
              variant="secondary"
              className="!text-[#efb7b7]"
              disabled={busy}
              onClick={onDelete}
            >
              Delete permanently
            </Button>
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel deletion
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="text"
            className="!text-[#efb7b7]"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={15} />
            Delete job
          </Button>
          {busy && (
            <p className="text-xs leading-relaxed text-muted">
              Wait for processing to finish before deleting.
            </p>
          )}
        </>
      )}
    </section>
  );
}
