"use client";

import { useState, useEffect, useRef } from "react";

type Mode = "full" | "data" | "metadata" | "files";
type Phase = "idle" | "running" | "done" | "error";

interface Props {
  slug: string;
}

export function RunBackupButton({ slug }: Props) {
  const [mode, setMode] = useState<Mode>("full");
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // Poll job status while running
  useEffect(() => {
    if (!jobId || phase !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}?tail=200`);
        if (!res.ok) return;
        const data = await res.json();
        setLog(data.log ?? []);
        if (data.status === "done") {
          setPhase("done");
          clearInterval(interval);
        } else if (data.status === "error") {
          setPhase("error");
          setErrorMsg(`Process exited with code ${data.exit_code}`);
          clearInterval(interval);
        }
      } catch {
        // network blip — keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, phase]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  async function handleRun() {
    setPhase("running");
    setLog([]);
    setErrorMsg("");
    setShowLog(true);

    try {
      const res = await fetch(`/api/clients/${slug}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setJobId(data.job_id);
    } catch (err: unknown) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to start backup.");
    }
  }

  const statusColor =
    phase === "done" ? "text-green-700" :
    phase === "error" ? "text-red-600" :
    "text-slate-500";

  const statusLabel =
    phase === "done" ? "✓ Completed" :
    phase === "error" ? `✗ Failed — ${errorMsg}` :
    phase === "running" ? "Running…" : "";

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          disabled={phase === "running"}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="full">Full</option>
          <option value="data">Data only</option>
          <option value="metadata">Metadata only</option>
          <option value="files">Files only</option>
        </select>

        <button
          onClick={handleRun}
          disabled={phase === "running"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-700 text-white hover:bg-brand-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {phase === "running" ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Running…
            </>
          ) : (
            "▶ Run Backup"
          )}
        </button>

        {statusLabel && (
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
        )}

        {(phase === "running" || phase === "done" || phase === "error") && (
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-700 underline"
          >
            {showLog ? "Hide log" : "Show log"}
          </button>
        )}
      </div>

      {showLog && log.length > 0 && (
        <div
          ref={logRef}
          className="w-full max-w-3xl max-h-64 overflow-y-auto rounded-lg bg-slate-900 text-slate-100 text-xs font-mono p-4 space-y-0.5"
        >
          {log.map((line, i) => (
            <div key={i} className="leading-5 whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
          {phase === "running" && (
            <div className="text-slate-400 animate-pulse">▌</div>
          )}
        </div>
      )}
    </div>
  );
}

