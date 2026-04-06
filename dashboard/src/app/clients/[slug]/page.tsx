import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientConfig } from "@/lib/clients";
import { listBackupFolders, buildBackupRun } from "@/lib/drive";
import { listGCSRunDates, buildGCSBackupRun } from "@/lib/gcs";
import { RunTable } from "@/components/RunTable";
import { RunBackupButton } from "@/components/RunBackupButton";
import { StatusBadge } from "@/components/StatusBadge";
import type { BackupRun, RunStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function ClientPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const config = getClientConfig(slug);
  if (!config) return notFound();

  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const isGCS = config.drive?.storage_backend === "gcs";

  let allDates: string[] = [];
  let runs: BackupRun[] = [];
  let totalPages = 1;
  let storageUrl: string;
  let connectionError: string | null = null;

  try {
    if (isGCS) {
      allDates = await listGCSRunDates(slug);
      totalPages = Math.ceil(allDates.length / limit);
      const pageDates = allDates.slice(offset, offset + limit);
      const runResults = await Promise.allSettled(
        pageDates.map((date) => buildGCSBackupRun(slug, date))
      );
      runs = runResults
        .filter(
          (r): r is PromiseFulfilledResult<BackupRun> => r.status === "fulfilled"
        )
        .map((r) => r.value);
      storageUrl = `https://console.cloud.google.com/storage/browser/makini-sf-files-${slug}?project=${config.gcp?.project_id}`;
    } else {
      const allFolders = await listBackupFolders(config.drive.root_folder_id);
      totalPages = Math.ceil(allFolders.length / limit);
      const pageFolders = allFolders.slice(offset, offset + limit);
      const runResults = await Promise.allSettled(
        pageFolders.map((folder) => buildBackupRun(folder))
      );
      runs = runResults
        .filter(
          (r): r is PromiseFulfilledResult<BackupRun> => r.status === "fulfilled"
        )
        .map((r) => r.value)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      storageUrl = `https://drive.google.com/drive/folders/${config.drive.root_folder_id}`;
    }
  } catch (err) {
    connectionError = err instanceof Error ? err.message : "Failed to connect to storage";
    storageUrl = isGCS 
      ? `https://console.cloud.google.com/storage/browser/makini-sf-files-${slug}?project=${config.gcp?.project_id}`
      : `https://drive.google.com/drive/folders/${config.drive.root_folder_id}`;
  }

  // Calculate stats
  const totalRecords = runs.reduce((acc, run) => {
    return (
      acc + (run.manifest?.objects.reduce((s, o) => s + o.record_count, 0) ?? 0)
    );
  }, 0);

  const totalSize = runs.reduce((acc, run) => {
    return (
      acc +
      (run.manifest?.objects.reduce((s, o) => s + o.file_size_bytes, 0) ?? 0)
    );
  }, 0);

  const lastRun = runs[0];
  const lastRunStatus: RunStatus = lastRun?.manifest
    ? lastRun.manifest.errors.length > 0 ||
      lastRun.manifest.objects.some((o) => o.status === "error")
      ? "partial"
      : "success"
    : lastRun
    ? "running"
    : "skipped";

  function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Connection Error Banner */}
      {connectionError && (
        <div className="mb-6 p-4 rounded-lg bg-warning/10 border border-warning/20">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-warning mt-0.5 shrink-0"
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
            <div>
              <h3 className="font-medium text-warning">Storage Not Connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {connectionError}. Configure the <code className="px-1.5 py-0.5 rounded bg-secondary text-xs font-mono">DASHBOARD_SA_JSON_B64</code> environment variable to connect to {isGCS ? "Google Cloud Storage" : "Google Drive"}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {config.client_name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                    config.sf_environment === "production"
                      ? "bg-primary/10 text-primary"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {config.sf_environment}
                </span>
                <span className="text-sm text-muted-foreground">
                  {config.sf_username}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Link
            href={`/clients/${slug}/edit`}
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
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </Link>
          <a
            href={storageUrl}
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
            {isGCS ? "Open GCS" : "Open Drive"}
          </a>
          <RunBackupButton slug={slug} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MetaCard
          label="Last Backup Status"
          value={
            <StatusBadge status={lastRunStatus} />
          }
        />
        <MetaCard
          label="Total Runs"
          value={
            <span className="font-mono text-lg font-semibold text-foreground">
              {allDates.length}
            </span>
          }
        />
        <MetaCard
          label="Records Protected"
          value={
            <span className="font-mono text-lg font-semibold text-foreground">
              {totalRecords.toLocaleString()}
            </span>
          }
        />
        <MetaCard
          label="Total Storage"
          value={
            <span className="font-mono text-lg font-semibold text-foreground">
              {formatBytes(totalSize)}
            </span>
          }
        />
        <MetaCard
          label="Retention"
          value={
            <span className="font-mono text-lg font-semibold text-foreground">
              {config.retention_days} days
            </span>
          }
        />
      </div>

      {/* Backup History */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Backup History
        </h2>
        <RunTable runs={runs} slug={slug} />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/clients/${slug}?page=${page - 1}`}
                className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/clients/${slug}?page=${page + 1}`}
                className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="glass-card gradient-border p-4">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      {value}
    </div>
  );
}
