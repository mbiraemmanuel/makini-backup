"use client";

import { useState } from "react";
import { StatusBadge, StatusDot } from "./StatusBadge";
import type { ObjectResult, RunStatus } from "@/lib/types";

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface ObjectTableProps {
  objects: ObjectResult[];
  dataFiles: { id: string; name: string; size: string }[];
}

export function ObjectTable({ objects, dataFiles }: ObjectTableProps) {
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");
  const [search, setSearch] = useState("");
  const [selectedObject, setSelectedObject] = useState<ObjectResult | null>(null);

  const fileMap = new Map(dataFiles.map((f) => [f.name, f]));

  const filteredObjects = objects.filter((obj) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "success" && obj.status === "success") ||
      (filter === "error" && obj.status === "error");
    const matchesSearch =
      search === "" || obj.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const successCount = objects.filter((o) => o.status === "success").length;
  const errorCount = objects.filter((o) => o.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search objects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({objects.length})
          </button>
          <button
            onClick={() => setFilter("success")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "success"
                ? "bg-success/20 text-success"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Success ({successCount})
          </button>
          <button
            onClick={() => setFilter("error")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "error"
                ? "bg-error/20 text-error"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Errors ({errorCount})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card gradient-border overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {["Object", "Status", "Records", "File Size", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredObjects.map((obj) => {
                const csvName = `${obj.name}.csv`;
                const driveFile = fileMap.get(csvName);
                return (
                  <tr
                    key={obj.name}
                    className="hover:bg-secondary/30 transition-colors group cursor-pointer"
                    onClick={() => setSelectedObject(obj)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <StatusDot status={obj.status as RunStatus} />
                        <div>
                          <span className="font-mono text-sm font-medium text-foreground">
                            {obj.name}
                          </span>
                          {obj.error_message && (
                            <p className="text-xs text-error mt-0.5 truncate max-w-xs">
                              {obj.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={obj.status as RunStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-foreground">
                        {obj.record_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-muted-foreground">
                        {fmtBytes(obj.file_size_bytes)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {driveFile ? (
                          <a
                            href={`/api/drive/download?fileId=${driveFile.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                              />
                            </svg>
                            CSV
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedObject(obj);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedObject && (
        <ObjectDetailModal
          object={selectedObject}
          onClose={() => setSelectedObject(null)}
        />
      )}
    </div>
  );
}

function ObjectDetailModal({
  object,
  onClose,
}: {
  object: ObjectResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg glass-card gradient-border p-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{object.name}</h3>
              <p className="text-sm text-muted-foreground">Object Details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Status
              </span>
              <div className="mt-1">
                <StatusBadge status={object.status as RunStatus} />
              </div>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Records
              </span>
              <p className="font-mono text-lg font-semibold text-foreground mt-1">
                {object.record_count.toLocaleString()}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                File Size
              </span>
              <p className="font-mono text-lg font-semibold text-foreground mt-1">
                {fmtBytes(object.file_size_bytes)}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Avg Record Size
              </span>
              <p className="font-mono text-lg font-semibold text-foreground mt-1">
                {object.record_count > 0
                  ? fmtBytes(Math.round(object.file_size_bytes / object.record_count))
                  : "--"}
              </p>
            </div>
          </div>

          {object.error_message && (
            <div className="bg-error/10 border border-error/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-error flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <div>
                  <h4 className="font-medium text-error text-sm">Error Message</h4>
                  <p className="text-sm text-error/80 mt-1 font-mono">
                    {object.error_message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
