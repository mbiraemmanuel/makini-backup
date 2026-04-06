"use client";

import Link from "next/link";
import { StatusBadge, StatusDot } from "./StatusBadge";
import type { ClientSummary, RunStatus } from "@/lib/types";

function fmt(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function ClientCard({ summary }: { summary: ClientSummary }) {
  const run = summary.last_run;
  const manifest = run?.manifest;

  const overallStatus: RunStatus = manifest
    ? manifest.errors.length > 0
      ? "partial"
      : manifest.objects.some((o) => o.status === "error")
      ? "partial"
      : "success"
    : run
    ? "running"
    : "skipped";

  const totalRecords = manifest?.objects.reduce(
    (sum, o) => sum + (o.record_count ?? 0),
    0
  );
  const failedObjects =
    manifest?.objects.filter((o) => o.status === "error").length ?? 0;
  const successObjects =
    manifest?.objects.filter((o) => o.status === "success").length ?? 0;

  return (
    <Link
      href={`/clients/${summary.slug}`}
      className="group block glass-card gradient-border p-5 hover:bg-card/80 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-base leading-tight group-hover:text-primary transition-colors">
              {summary.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.slug}
            </p>
          </div>
        </div>
        {run ? (
          <StatusBadge status={overallStatus} />
        ) : summary.total_runs === 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs font-medium text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            Pending
          </span>
        ) : null}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-secondary/50 rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Last Backup
          </span>
          <p className="font-mono text-sm text-foreground mt-1">
            {run ? run.date : "Never"}
          </p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Total Runs
          </span>
          <p className="font-mono text-sm text-foreground mt-1">
            {summary.total_runs}
          </p>
        </div>
        {manifest && (
          <>
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Records
              </span>
              <p className="font-mono text-sm text-foreground mt-1">
                {totalRecords?.toLocaleString()}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Objects
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-sm text-success">
                  {successObjects}
                </span>
                {failedObjects > 0 && (
                  <>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-mono text-sm text-error">
                      {failedObjects} failed
                    </span>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
              summary.sf_environment === "production"
                ? "bg-primary/10 text-primary"
                : "bg-warning/10 text-warning"
            }`}
          >
            {summary.sf_environment}
          </span>
          <span className="text-xs text-muted-foreground">
            {summary.retention_days}d retention
          </span>
        </div>
        <svg
          className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
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
      </div>
    </Link>
  );
}
