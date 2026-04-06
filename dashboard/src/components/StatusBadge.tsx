import clsx from "clsx";
import type { RunStatus } from "@/lib/types";

const STYLES: Record<RunStatus, string> = {
  success: "bg-success/10 text-success border-success/20",
  partial: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  running: "bg-info/10 text-info border-info/20",
  skipped: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<RunStatus, string> = {
  success: "Healthy",
  partial: "Partial",
  error: "Error",
  running: "Running",
  skipped: "Skipped",
};

const ICONS: Record<RunStatus, JSX.Element> = {
  success: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  partial: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  error: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  running: (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  ),
  skipped: (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  ),
};

export function StatusBadge({ status, showIcon = true }: { status: RunStatus; showIcon?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
        STYLES[status] ?? STYLES.skipped
      )}
    >
      {showIcon && ICONS[status]}
      {LABELS[status] ?? status}
    </span>
  );
}

export function StatusDot({ status }: { status: RunStatus }) {
  const colors: Record<RunStatus, string> = {
    success: "bg-success",
    partial: "bg-warning",
    error: "bg-error",
    running: "bg-info animate-pulse",
    skipped: "bg-muted-foreground",
  };

  return (
    <span className={clsx("w-2 h-2 rounded-full", colors[status] ?? colors.skipped)} />
  );
}
