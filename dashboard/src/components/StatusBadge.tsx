import clsx from "clsx";
import type { RunStatus } from "@/lib/types";

const STYLES: Record<RunStatus, string> = {
  success: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  partial: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  error:   "bg-red-100 text-red-800 ring-1 ring-red-300",
  running: "bg-blue-100 text-blue-800 ring-1 ring-blue-300",
  skipped: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const LABELS: Record<RunStatus, string> = {
  success: "Success",
  partial: "Partial",
  error:   "Error",
  running: "Running",
  skipped: "Skipped",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status] ?? STYLES.skipped
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
