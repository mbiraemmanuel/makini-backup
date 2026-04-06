"use client";

import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import type { BackupRun, RunStatus } from "@/lib/types";

function overallStatus(run: BackupRun): RunStatus {
  if (!run.manifest) return "running";
  if (run.manifest.errors.length > 0) return "partial";
  if (run.manifest.objects.some((o) => o.status === "error")) return "partial";
  return "success";
}

function fmt(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function RunTable({ runs, slug }: { runs: BackupRun[]; slug: string }) {
  if (runs.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        No backup runs found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {["Date", "Status", "Type", "Objects", "Records", "Duration", ""].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((run) => {
            const m = run.manifest;
            const successCount = m?.objects.filter((o) => o.status === "success").length ?? "—";
            const errorCount = m?.objects.filter((o) => o.status === "error").length ?? 0;
            const totalRecords = m?.objects.reduce((s, o) => s + o.record_count, 0) ?? "—";

            return (
              <tr key={run.date} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-slate-800">
                  {run.date}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={overallStatus(run)} />
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">
                  {m?.run_type ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {m ? (
                    <span>
                      <span className="text-emerald-700">{successCount}</span>
                      {errorCount > 0 && (
                        <span className="text-red-600"> / {errorCount} err</span>
                      )}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {typeof totalRecords === "number"
                    ? totalRecords.toLocaleString()
                    : totalRecords}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {m?.duration_seconds != null ? `${m.duration_seconds}s` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/clients/${slug}/runs/${run.date}`}
                    className="text-brand-600 hover:text-brand-700 font-medium hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
