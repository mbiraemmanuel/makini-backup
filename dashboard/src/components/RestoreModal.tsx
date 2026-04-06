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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Restore Backup</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Source: <span className="font-mono">{date}</span> · Client:{" "}
              <span className="font-mono">{slug}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-5">
          {/* Dry run toggle */}
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <input
              id="dry-run"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            <label htmlFor="dry-run" className="text-sm font-medium text-amber-800">
              Dry run — validate only, do not write to Salesforce
            </label>
          </div>

          {/* Object selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">
                Objects to restore{" "}
                <span className="text-slate-400 font-normal">
                  (leave all unchecked to restore everything)
                </span>
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={selectAll}
                  className="text-brand-600 hover:underline"
                >
                  All
                </button>
                <button
                  onClick={clearAll}
                  className="text-slate-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {availableObjects.map((obj) => (
                <label
                  key={obj}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(obj)}
                    onChange={() => toggleObject(obj)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className="font-mono text-sm text-slate-800">{obj}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Warning */}
          {!dryRun && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <strong>Warning:</strong> This will upsert records back into Salesforce.
              Existing records may be overwritten. Ensure you have reviewed the backup
              data before proceeding.
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg p-4 text-sm border ${
                result.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {result.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (result?.success ?? false)}
            className="px-5 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
