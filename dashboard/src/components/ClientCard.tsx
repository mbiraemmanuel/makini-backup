import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
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
      : (manifest.objects.some((o) => o.status === "error") ? "partial" : "success")
    : run
    ? "running"
    : "skipped";

  const totalRecords = manifest?.objects.reduce(
    (sum, o) => sum + (o.record_count ?? 0),
    0
  );
  const failedObjects = manifest?.objects.filter((o) => o.status === "error").length ?? 0;

  return (
    <Link
      href={`/clients/${summary.slug}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-500 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900 text-base leading-tight">
            {summary.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {summary.slug} · {summary.sf_environment}
          </p>
        </div>
        {run && <StatusBadge status={overallStatus} />}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">
            Last backup
          </span>
          <p className="font-medium text-slate-800 mt-0.5">
            {run ? run.date : "No backups yet"}
          </p>
        </div>
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">
            Total runs
          </span>
          <p className="font-medium text-slate-800 mt-0.5">{summary.total_runs}</p>
        </div>
        {manifest && (
          <>
            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                Records
              </span>
              <p className="font-medium text-slate-800 mt-0.5">
                {totalRecords?.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wide">
                Failed objects
              </span>
              <p
                className={`font-medium mt-0.5 ${
                  failedObjects > 0 ? "text-red-600" : "text-slate-800"
                }`}
              >
                {failedObjects}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Retention: {summary.retention_days} days</span>
        {manifest?.duration_seconds && (
          <span>Duration: {manifest.duration_seconds}s</span>
        )}
      </div>
    </Link>
  );
}
