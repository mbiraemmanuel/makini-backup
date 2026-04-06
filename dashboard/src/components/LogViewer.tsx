"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  jobId: string;
  expectedTotal?: number;
}

const RE_EXPORTING = /\|\s+INFO\s+\|[^|]+\|\s+Exporting /;

function levelColor(line: string): string {
  if (/\|\s+ERROR\s+\|/.test(line)) return "text-error";
  if (/\|\s+WARNING\s+\|/.test(line)) return "text-warning";
  if (/\|\s+SUCCESS\s+\|/.test(line)) return "text-success";
  return "text-muted-foreground";
}

export function LogViewer({ jobId, expectedTotal }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("running");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

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
      setError("Stream disconnected - job may have finished.");
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
  const exportingCount = lines.filter((l) => RE_EXPORTING.test(l)).length;
  const progressPct =
    expectedTotal && expectedTotal > 0
      ? Math.min(100, Math.round((exportingCount / expectedTotal) * 100))
      : null;

  return (
    <div className="glass-card gradient-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <h2 className="text-sm font-semibold text-foreground">Live Logs</h2>
        </div>
        <div className="flex items-center gap-3">
          {connected && !isFinished && (
            <span className="flex items-center gap-1.5 text-xs text-success font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Live
            </span>
          )}
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`text-xs font-medium transition-colors ${
              autoScroll
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Auto-scroll {autoScroll ? "on" : "off"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progressPct !== null && (
        <div className="px-4 py-3 border-b border-border bg-secondary/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Objects processed</span>
            <span>
              {exportingCount} / {expectedTotal}{" "}
              <span className="font-semibold text-foreground">{progressPct}%</span>
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Indeterminate bar */}
      {progressPct === null && !isFinished && (
        <div className="h-1 bg-secondary overflow-hidden">
          <div className="h-1 bg-primary animate-pulse w-1/3" />
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-warning/10 text-warning text-xs border-b border-warning/20">
          {error}
        </div>
      )}

      {/* Log terminal */}
      <div
        className="h-80 overflow-y-auto bg-background p-4 font-mono text-xs leading-5 custom-scrollbar"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
          setAutoScroll(atBottom);
        }}
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Waiting for log output...</span>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all ${levelColor(line)}`}
            >
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
        <span>{lines.length} lines</span>
        {isFinished && (
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                jobStatus === "done" ? "bg-success" : "bg-error"
              }`}
            />
            Job {jobStatus}
          </span>
        )}
      </div>
    </div>
  );
}
