"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  jobId: string;
  /** Expected total objects from the last completed run — used for progress bar. */
  expectedTotal?: number;
}

// Matches lines like: | INFO     | __main__:run_data_backup:83 | Exporting Account...
const RE_EXPORTING = /\|\s+INFO\s+\|[^|]+\|\s+Exporting /;

function levelColor(line: string): string {
  if (/\|\s+ERROR\s+\|/.test(line)) return "text-red-400";
  if (/\|\s+WARNING\s+\|/.test(line)) return "text-amber-400";
  if (/\|\s+SUCCESS\s+\|/.test(line)) return "text-emerald-400";
  return "text-slate-300";
}

export function LogViewer({ jobId, expectedTotal }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("running");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Keep ref in sync with state so scroll handler can read it without stale closure
  autoScrollRef.current = autoScroll;

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream`);
    setConnected(true);
    setError(null);

    es.addEventListener("log", (e) => {
      const line = JSON.parse(e.data) as string;
      setLines((prev) => [...prev, line]);
    });

    es.addEventListener("status", (e) => {
      const status = JSON.parse(e.data) as string;
      setJobStatus(status);
      if (status !== "running") {
        es.close();
        setConnected(false);
      }
    });

    es.onerror = () => {
      setError("Stream disconnected — job may have finished.");
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [jobId]);

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines]);

  const isFinished = jobStatus !== "running";

  // Progress: count "Exporting X..." lines seen so far
  const exportingCount = lines.filter((l) => RE_EXPORTING.test(l)).length;
  const progressPct =
    expectedTotal && expectedTotal > 0
      ? Math.min(100, Math.round((exportingCount / expectedTotal) * 100))
      : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700">Live Logs</h2>
        <div className="flex items-center gap-3">
          {connected && !isFinished && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          )}
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`text-xs font-medium ${autoScroll ? "text-brand-700" : "text-slate-400 hover:text-slate-600"}`}
          >
            Auto-scroll {autoScroll ? "on" : "off"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progressPct !== null && (
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Objects processed</span>
            <span>
              {exportingCount} / {expectedTotal} &nbsp;
              <span className="font-semibold text-slate-700">{progressPct}%</span>
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-brand-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progressPct >= 100 && !isFinished && (
            <p className="text-xs text-amber-500 mt-1">
              More objects than last run — wrapping up…
            </p>
          )}
        </div>
      )}

      {/* Indeterminate bar when no expectedTotal */}
      {progressPct === null && !isFinished && (
        <div className="h-1 bg-slate-200 overflow-hidden">
          <div className="h-1 bg-brand-500 animate-[pulse_1.5s_ease-in-out_infinite] w-1/3" />
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-amber-50 text-amber-700 text-xs border-b border-amber-100">
          {error}
        </div>
      )}

      {/* Log terminal */}
      <div
        className="h-96 overflow-y-auto bg-slate-900 p-4 font-mono text-xs leading-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
          setAutoScroll(atBottom);
        }}
      >
        {lines.length === 0 ? (
          <span className="text-slate-500">Waiting for log output…</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${levelColor(line)}`}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
        {lines.length} lines
        {isFinished && (
          <span className="ml-2 text-slate-500">· job {jobStatus}</span>
        )}
      </div>
    </div>
  );
}
