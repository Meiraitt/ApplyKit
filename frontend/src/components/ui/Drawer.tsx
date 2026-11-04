import { Button } from "./Button";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);

  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const before = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialog.showModal();

    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-full overflow-y-auto border-0 bg-[#1b2123] px-4.5 pb-8 text-[#e6eae7] shadow-[-20px_0_70px_#0005] backdrop:bg-[#070b0dc4] tablet:w-[660px] tablet:border-l tablet:border-[#46514d] tablet:px-7 [&_p]:wrap-anywhere [&_h2]:wrap-anywhere [&_h3]:wrap-anywhere [&_h4]:wrap-anywhere [&_li]:wrap-anywhere"
      aria-label="Job details"
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();

          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="sticky top-0 z-10 mb-6 flex items-center justify-between border-b border-line bg-[#1b2123] py-4 text-xs text-muted [&_button]:min-h-11 [&_button]:min-w-11">
        <span>Job details</span>
        <Button
          autoFocus
          aria-label="Close details"
          variant="quiet"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
