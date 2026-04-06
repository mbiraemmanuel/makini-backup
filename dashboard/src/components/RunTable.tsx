"use client";

import Link from "next/link";
import { StatusBadge, StatusDot } from "./StatusBadge";
import type { BackupRun, RunStatus } from "@/lib/types";

function overallStatus(run: BackupRun): RunStatus {
  if (!run.manifest) return "running";
  if (run.manifest.errors.length > 0) return "partial";
  if (run.manifest.objects.some((o) => o.status === "error")) return "partial";
  return "success";
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "--";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function RunTable({ runs, slug }: { runs: BackupRun[]; slug: string }) {
  if (runs.length === 0) {
    return (
      <div className="glass-card gradient-border p-12 text-center">
        <div className="w-14 h-14 rounded-xl bg-secondary mx-auto mb-4 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No backup runs found</h3>
        <p className="text-muted-foreground text-sm">
          Run your first backup to see the history here.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card gradient-border overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {["Date", "Status", "Type", "Objects", "Records", "Size", "Duration", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => {
              const m = run.manifest;
              const successCount =
                m?.objects.filter((o) => o.status === "success").length ?? 0;
              const errorCount =
                m?.objects.filter((o) => o.status === "error").length ?? 0;
              const totalRecords =
                m?.objects.reduce((s, o) => s + o.record_count, 0) ?? 0;
              const totalSize =
                m?.objects.reduce((s, o) => s + o.file_size_bytes, 0) ?? 0;

              return (
                <tr
                  key={run.date}
                  className="hover:bg-secondary/30 transition-colors group"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <StatusDot status={overallStatus(run)} />
                      <span className="font-mono text-sm font-medium text-foreground">
                        {run.date}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={overallStatus(run)} />
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-muted-foreground capitalize">
                      {m?.run_type ?? "--"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {m ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-success">
                          {successCount}
                        </span>
                        {errorCount > 0 && (
                          <>
                            <span className="text-muted-foreground/50">/</span>
                            <span className="font-mono text-sm text-error">
                              {errorCount}
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm text-foreground">
                      {totalRecords > 0 ? totalRecords.toLocaleString() : "--"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm text-muted-foreground">
                      {totalSize > 0 ? formatBytes(totalSize) : "--"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm text-muted-foreground">
                      {formatDuration(m?.duration_seconds)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/clients/${slug}/runs/${run.date}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      View
                      <svg
                        className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
