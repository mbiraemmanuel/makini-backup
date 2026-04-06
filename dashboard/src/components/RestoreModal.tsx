"use client";

import { useState } from "react";

interface Props {
  slug: string;
  date: string;
  availableObjects: string[];
  onClose: () => void;
}

export function RestoreModal({ slug, date, availableObjects, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  function toggleObject(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(availableObjects));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${slug}/runs/${date}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objects: selected.size > 0 ? Array.from(selected) : [],
          dry_run: dryRun,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          message: `Restore job submitted. Execution ID: ${data.cloud_run_execution_id}`,
        });
      } else {
        setResult({ success: false, message: data.error ?? "Unknown error" });
      }
    } catch (err) {
      setResult({ success: false, message: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] glass-card gradient-border flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-info"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Restore Backup</h2>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{date}</span> - {slug}
              </p>
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

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-5 custom-scrollbar">
          {/* Dry run toggle */}
          <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg border border-warning/20">
            <input
              id="dry-run"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 accent-warning rounded"
            />
            <label htmlFor="dry-run" className="text-sm font-medium text-warning">
              Dry run - validate only, do not write to Salesforce
            </label>
          </div>

          {/* Object selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">
                Objects to restore{" "}
                <span className="text-muted-foreground font-normal">
                  (leave all unchecked to restore everything)
                </span>
              </p>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={selectAll}
                  className="text-primary hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={clearAll}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto custom-scrollbar bg-secondary/30">
              {availableObjects.map((obj) => (
                <label
                  key={obj}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(obj)}
                    onChange={() => toggleObject(obj)}
                    className="h-4 w-4 accent-primary rounded"
                  />
                  <span className="font-mono text-sm text-foreground">{obj}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Warning */}
          {!dryRun && (
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
                  <p className="text-sm font-medium text-error">Warning</p>
                  <p className="text-sm text-error/80 mt-1">
                    This will upsert records back into Salesforce. Existing records may
                    be overwritten. Ensure you have reviewed the backup data before
                    proceeding.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg p-4 border ${
                result.success
                  ? "bg-success/10 border-success/20"
                  : "bg-error/10 border-error/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <svg
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    result.success ? "text-success" : "text-error"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  {result.success ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  )}
                </svg>
                <p
                  className={`text-sm ${
                    result.success ? "text-success" : "text-error"
                  }`}
                >
                  {result.message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (result?.success ?? false)}
            className="px-5 py-2 text-sm rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? "Submitting..."
              : dryRun
              ? "Run Dry-Run Validation"
              : "Start Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}
