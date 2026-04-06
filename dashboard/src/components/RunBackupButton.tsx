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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          disabled={phase === "running"}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="full">Full Backup</option>
          <option value="data">Data Only</option>
          <option value="metadata">Metadata Only</option>
          <option value="files">Files Only</option>
        </select>

        <button
          onClick={handleRun}
          disabled={phase === "running"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {phase === "running" ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                />
              </svg>
              Run Backup
            </>
          )}
        </button>

        {phase === "done" && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-success">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Completed
          </span>
        )}

        {phase === "error" && (
          <span className="text-sm font-medium text-error">{errorMsg}</span>
        )}

        {(phase === "running" || phase === "done" || phase === "error") && (
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
          >
            {showLog ? "Hide log" : "Show log"}
          </button>
        )}
      </div>

      {showLog && log.length > 0 && (
        <div
          ref={logRef}
          className="w-full max-h-72 overflow-y-auto rounded-lg bg-background border border-border text-xs font-mono p-4 custom-scrollbar"
        >
          {log.map((line, i) => (
            <div
              key={i}
              className={`leading-5 whitespace-pre-wrap break-all ${
                /\|\s+ERROR\s+\|/.test(line)
                  ? "text-error"
                  : /\|\s+WARNING\s+\|/.test(line)
                  ? "text-warning"
                  : /\|\s+SUCCESS\s+\|/.test(line)
                  ? "text-success"
                  : "text-muted-foreground"
              }`}
            >
              {line}
            </div>
          ))}
          {phase === "running" && (
            <div className="text-muted-foreground animate-pulse">|</div>
          )}
        </div>
      )}
    </div>
  );
}
