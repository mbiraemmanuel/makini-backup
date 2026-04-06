import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { getClientConfig } from "@/lib/clients";
import { listBackupFolders, listDataFiles, buildBackupRun } from "@/lib/drive";
import { listGCSRunDates, buildGCSBackupRun } from "@/lib/gcs";
import { StatusBadge } from "@/components/StatusBadge";
import { ObjectTable } from "@/components/ObjectTable";
import RestoreButton from "@/components/RestoreButton";
import { formatDistanceToNow } from "date-fns";
import type { RunStatus, BackupRun } from "@/lib/types";
import { LogViewer } from "@/components/LogViewer";

interface JobRecord {
  job_id: string;
  slug: string;
  mode: string;
  status: string;
  exit_code: number | null;
  started_at: string;
  ended_at: string | null;
}

function findJobForDate(slug: string, date: string): JobRecord | null {
  const jobsDir = path.resolve(process.cwd(), "..", "jobs");
  if (!fs.existsSync(jobsDir)) return null;
  const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const job: JobRecord = JSON.parse(
        fs.readFileSync(path.join(jobsDir, file), "utf-8")
      );
      if (job.slug === slug && job.started_at?.startsWith(date)) return job;
    } catch {
      // skip malformed files
    }
  }
  return null;
}

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; date: string }>;
}

export default async function RunDetailPage(props: Props) {
  const params = await props.params;
  const config = getClientConfig(params.slug);
  if (!config) notFound();

  const isGCS = config.drive?.storage_backend === "gcs";

  let run: BackupRun;
  let allFolders: { id: string; name: string; createdTime: string }[] = [];

  if (isGCS) {
    const allDates = await listGCSRunDates(params.slug);
    if (!allDates.includes(params.date)) notFound();
    run = await buildGCSBackupRun(params.slug, params.date);
  } else {
    allFolders = await listBackupFolders(config.drive.root_folder_id);
    const folder = allFolders.find((f) => f.name === params.date);
    if (!folder) notFound();
    run = await buildBackupRun(folder);
  }

  const folder = !isGCS
    ? allFolders.find((f) => f.name === params.date)
    : null;
  const manifest = run.manifest;

  if (!manifest) {
    const job = findJobForDate(params.slug, params.date);

    let expectedTotal: number | undefined;
    if (isGCS) {
      const allDates = await listGCSRunDates(params.slug);
      for (const d of allDates.filter((d) => d !== params.date)) {
        const prevRun = await buildGCSBackupRun(params.slug, d);
        if (prevRun.manifest && prevRun.manifest.objects.length > 0) {
          expectedTotal = prevRun.manifest.objects.length;
          break;
        }
      }
    } else {
      const otherFolders = allFolders.filter((f) => f.name !== params.date);
      for (const f of otherFolders) {
        const prevRun = await buildBackupRun(f);
        if (prevRun.manifest && prevRun.manifest.objects.length > 0) {
          expectedTotal = prevRun.manifest.objects.length;
          break;
        }
      }
    }

    return (
      <div className="p-6 lg:p-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-info animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
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
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Backup - {params.date}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={(job?.status as RunStatus) ?? "running"} />
              <span className="text-sm text-muted-foreground">
                {config.client_name}
              </span>
            </div>
          </div>
        </div>

        {(!job || job.status === "running") && (
          <div className="glass-card gradient-border p-6 mb-6 border-l-4 border-l-info">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-info flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
              <div>
                <p className="font-medium text-foreground">Backup in progress</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The manifest will appear here once the job completes. This page
                  will refresh automatically.
                </p>
              </div>
            </div>
          </div>
        )}

        {job && job.status === "error" && (
          <div className="glass-card gradient-border p-6 mb-6 border-l-4 border-l-error">
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
                <p className="font-medium text-error">Backup failed</p>
                <p className="text-sm text-error/80 mt-1">
                  The backup process exited with an error. Check the logs below for
                  details.
                </p>
              </div>
            </div>
          </div>
        )}

        {job && (
          <div className="glass-card gradient-border p-6 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Job Details
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Job ID
                </span>
                <p className="font-mono text-xs text-foreground mt-1 break-all">
                  {job.job_id}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Mode
                </span>
                <p className="text-sm font-medium text-foreground mt-1 capitalize">
                  {job.mode}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Status
                </span>
                <p className="text-sm font-medium text-foreground mt-1 capitalize">
                  {job.status}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Started
                </span>
                <p className="text-sm text-foreground mt-1">
                  {formatDistanceToNow(new Date(job.started_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-6">
          <a
            href=""
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Refresh page
          </a>
        </div>

        {job && <LogViewer jobId={job.job_id} expectedTotal={expectedTotal} />}

        <meta httpEquiv="refresh" content="30" />
      </div>
    );
  }

  const dataFiles =
    !isGCS && folder ? await listDataFiles(folder.id) : [];

  const startedAt = manifest.started_at
    ? formatDistanceToNow(new Date(manifest.started_at), { addSuffix: true })
    : params.date;

  const durationLabel =
    manifest.duration_seconds != null
      ? manifest.duration_seconds >= 60
        ? `${Math.floor(manifest.duration_seconds / 60)}m ${
            manifest.duration_seconds % 60
          }s`
        : `${manifest.duration_seconds}s`
      : "--";

  const globalErrors: string[] = manifest.errors ?? [];

  const overallStatus: RunStatus =
    globalErrors.length > 0 ||
    manifest.objects.some((o) => o.status === "error")
      ? "partial"
      : "success";

  const totalRecords = manifest.objects.reduce(
    (s, o) => s + (o.record_count ?? 0),
    0
  );
  const totalSize = manifest.objects.reduce(
    (s, o) => s + (o.file_size_bytes ?? 0),
    0
  );
  const availableObjects = manifest.objects.map((o) => o.name);

  function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              overallStatus === "success"
                ? "bg-success/10 border border-success/20"
                : "bg-warning/10 border border-warning/20"
            }`}
          >
            <svg
              className={`w-6 h-6 ${
                overallStatus === "success" ? "text-success" : "text-warning"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              {overallStatus === "success" ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              )}
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Backup - {params.date}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={overallStatus} />
              <span className="text-sm text-muted-foreground">
                {config.client_name}
              </span>
              <span className="text-sm text-muted-foreground">
                ran {startedAt}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {config.drive.storage_backend === "gcs" ? (
            <a
              href={`https://console.cloud.google.com/storage/browser/makini-sf-files-${params.slug}?project=${config.gcp.project_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              Open in GCS
            </a>
          ) : (
            <a
              href={`https://drive.google.com/drive/folders/${folder?.id ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              Open in Drive
            </a>
          )}
          <RestoreButton
            slug={params.slug}
            date={params.date}
            availableObjects={availableObjects}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <SummaryCard
          label="Type"
          value={manifest.run_type === "full" ? "Full Backup" : "Incremental"}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          }
        />
        <SummaryCard
          label="Objects"
          value={String(manifest.objects.length)}
          icon={
            <svg
              className="w-5 h-5"
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
          }
        />
        <SummaryCard
          label="Failed Objects"
          value={String(
            manifest.objects.filter((o) => o.status === "error").length
          )}
          warn={manifest.objects.some((o) => o.status === "error")}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          }
        />
        <SummaryCard
          label="Records"
          value={totalRecords.toLocaleString()}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
              />
            </svg>
          }
        />
        <SummaryCard
          label="Duration"
          value={durationLabel}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>

      {/* Data objects table */}
      {manifest.objects.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Data Objects
          </h2>
          <ObjectTable objects={manifest.objects} dataFiles={dataFiles} />
        </section>
      )}

      {/* Metadata result */}
      {manifest.metadata && (
        <section className="mb-8">
          <div className="glass-card gradient-border p-6">
            <div className="flex items-center justify-between mb-4">
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
                      d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                    />
                  </svg>
                </div>
                <h2 className="font-semibold text-foreground">Metadata Backup</h2>
              </div>
              <StatusBadge status={manifest.metadata.status} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Types Retrieved
                </span>
                <p className="font-mono text-lg font-semibold text-foreground mt-1">
                  {manifest.metadata.types_retrieved ?? "--"}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Zip Size
                </span>
                <p className="font-mono text-lg font-semibold text-foreground mt-1">
                  {manifest.metadata.zip_size_bytes != null
                    ? formatBytes(manifest.metadata.zip_size_bytes)
                    : "--"}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Files result */}
      {manifest.files && (
        <section className="mb-8">
          <div className="glass-card gradient-border p-6">
            <div className="flex items-center justify-between mb-4">
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
                      d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                    />
                  </svg>
                </div>
                <h2 className="font-semibold text-foreground">File Attachments</h2>
              </div>
              <StatusBadge status={manifest.files.status} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Files Backed Up
                </span>
                <p className="font-mono text-lg font-semibold text-foreground mt-1">
                  {manifest.files.count ?? "--"}
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Total Size
                </span>
                <p className="font-mono text-lg font-semibold text-foreground mt-1">
                  {manifest.files.total_size_bytes != null
                    ? formatBytes(manifest.files.total_size_bytes)
                    : "--"}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Global errors */}
      {globalErrors.length > 0 && (
        <section className="mb-8">
          <div className="glass-card gradient-border p-6 border-l-4 border-l-error">
            <h2 className="font-semibold text-error mb-4">
              Errors ({globalErrors.length})
            </h2>
            <ul className="space-y-2">
              {globalErrors.map((err, idx) => (
                <li
                  key={idx}
                  className="text-sm text-error/80 font-mono bg-error/10 rounded-lg p-3"
                >
                  {typeof err === "string" ? err : JSON.stringify(err)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warn,
  icon,
}: {
  label: string;
  value: string;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="glass-card gradient-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              warn ? "text-error" : "text-foreground"
            }`}
          >
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              warn ? "bg-error/10 text-error" : "bg-secondary text-muted-foreground"
            }`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
