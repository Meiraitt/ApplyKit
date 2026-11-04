import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "text";
const base =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[5px] border px-3.5 py-2.5 text-xs font-medium whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-accent text-[#17281d] hover:enabled:bg-[#afd6bd]",
  secondary:
    "border-[#3a4446] bg-[#252c2e] text-[#e0e6e2] hover:border-[#7e9287]",
  quiet:
    "border-line bg-transparent text-muted hover:bg-[#2a3234] hover:text-white",
  text: "border-transparent bg-transparent !px-0 !py-1 text-accent",
};
const styles = (variant: Variant, className: string) =>
  [base, variants[variant], className].join(" ");

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={styles(variant, className)} />;
}

export function ButtonLink({
  variant = "secondary",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a {...props} className={styles(variant, className)} />;
}
