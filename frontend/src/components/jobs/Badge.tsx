import { isBusy, stateLabels } from "../../lib/api";

export function Badge({ state }: { state: string }) {
  const color =
    state === "ready"
      ? "bg-[#25382e] text-[#acd5ba]"
      : isBusy(state)
        ? "bg-[#2b3142] text-[#c1c9e2]"
        : "bg-[#3a3024] text-[#e4c693]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] ${color}`}
    >
      <span className="size-1 rounded-full bg-current" />
      {stateLabels[state] ?? "No CV"}
    </span>
  );
}
