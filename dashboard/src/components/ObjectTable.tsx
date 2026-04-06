"use client";

import { StatusBadge } from "./StatusBadge";
import type { ObjectResult, RunStatus } from "@/lib/types";

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function ObjectTable({
  objects,
  dataFiles,
}: {
  objects: ObjectResult[];
  dataFiles: { id: string; name: string; size: string }[];
}) {
  const fileMap = new Map(dataFiles.map((f) => [f.name, f]));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {["Object", "Status", "Records", "File Size", "Error", "Download"].map((h) => (
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
          {objects.map((obj) => {
            const csvName = `${obj.name}.csv`;
            const driveFile = fileMap.get(csvName);
            return (
              <tr key={obj.name} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 font-mono text-slate-800 whitespace-nowrap">
                  {obj.name}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={obj.status as RunStatus} />
                </td>
                <td className="px-4 py-2 text-slate-700 text-right tabular-nums">
                  {obj.record_count.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-600 text-right tabular-nums">
                  {fmtBytes(obj.file_size_bytes)}
                </td>
                <td className="px-4 py-2 text-red-600 text-xs max-w-xs truncate">
                  {obj.error_message ?? ""}
                </td>
                <td className="px-4 py-2">
                  {driveFile ? (
                    <a
                      href={`/api/drive/download?fileId=${driveFile.id}`}
                      className="text-brand-600 hover:text-brand-700 hover:underline text-xs font-medium"
                    >
                      CSV ↓
                    </a>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
