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
      const job: JobRecord = JSON.parse(fs.readFileSync(path.join(jobsDir, file), "utf-8"));
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

  // Resolve the run — either from GCS or Drive
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

  const folder = !isGCS ? allFolders.find((f) => f.name === params.date) : null;
  const manifest = run.manifest;

  if (!manifest) {
    const job = findJobForDate(params.slug, params.date);

    // Find the most recent completed run to use as expected total for the progress bar
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:text-brand-700">Dashboard</Link>
          <span className="mx-2">/</span>
          <Link href={`/clients/${params.slug}`} className="hover:text-brand-700">{config.client_name}</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-800 font-medium">{params.date}</span>
        </nav>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Backup — {params.date}</h1>
          <StatusBadge status={(job?.status as RunStatus) ?? "running"} />
        </div>

        {(!job || job.status === "running") && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <p className="text-blue-800 font-medium text-sm mb-1">Backup in progress</p>
            <p className="text-blue-600 text-sm">
              The manifest will appear here once the job completes. This page will refresh automatically.
            </p>
          </div>
        )}
        {job && job.status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <p className="text-red-800 font-medium text-sm mb-1">Backup failed</p>
            <p className="text-red-600 text-sm">
              The backup process exited with an error. Check the logs below for details.
            </p>
          </div>
        )}

        {job && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-700 mb-4">Job Details</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Job ID</dt>
                <dd className="mt-1 text-slate-700 font-mono text-xs break-all">{job.job_id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Mode</dt>
                <dd className="mt-1 text-slate-700 font-medium capitalize">{job.mode}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Status</dt>
                <dd className="mt-1 text-slate-700 font-medium capitalize">{job.status}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">Started</dt>
                <dd className="mt-1 text-slate-700">
                  {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="text-center">
          <a href="" className="text-sm text-brand-700 hover:text-brand-900 font-medium">
            ↻ Refresh page
          </a>
        </div>

        {job && (
          <div className="mt-6">
            <LogViewer jobId={job.job_id} expectedTotal={expectedTotal} />
          </div>
        )}

        {/* Auto-refresh every 30s while job is running */}
        <meta httpEquiv="refresh" content="30" />
      </div>
    );
  }

  // Data files are only available for Drive-backed runs (used for download links in ObjectTable)
  const dataFiles = (!isGCS && folder) ? await listDataFiles(folder.id) : [];

  const startedAt = manifest.started_at
    ? formatDistanceToNow(new Date(manifest.started_at), { addSuffix: true })
    : params.date;

  const durationLabel =
    manifest.duration_seconds != null
      ? manifest.duration_seconds >= 60
        ? `${Math.floor(manifest.duration_seconds / 60)}m ${manifest.duration_seconds % 60}s`
        : `${manifest.duration_seconds}s`
      : "—";

  const globalErrors: string[] = manifest.errors ?? [];

  const overallStatus: RunStatus =
    globalErrors.length > 0 || manifest.objects.some((o) => o.status === "error")
      ? "partial"
      : "success";

  const totalRecords = manifest.objects.reduce((s, o) => s + (o.record_count ?? 0), 0);
  const availableObjects = manifest.objects.map((o) => o.name);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-700">
          Dashboard
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/clients/${params.slug}`} className="hover:text-brand-700">
          {config.client_name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-800 font-medium">{params.date}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-900">Backup — {params.date}</h1>
            <StatusBadge status={overallStatus} />
          </div>
          <p className="text-slate-500 text-sm">
            {config.client_name} &middot; ran {startedAt} &middot; {durationLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {config.drive.storage_backend === "gcs" ? (
            <a
              href={`https://console.cloud.google.com/storage/browser/makini-sf-files-${params.slug}?project=${config.gcp.project_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-700 hover:text-brand-900 font-medium"
            >
              Open in GCS ↗
            </a>
          ) : (
            <a
              href={`https://drive.google.com/drive/folders/${folder?.id ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-700 hover:text-brand-900 font-medium"
            >
              Open in Drive ↗
            </a>
          )}
          <RestoreButton slug={params.slug} date={params.date} availableObjects={availableObjects} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <SummaryCard
          label="Type"
          value={manifest.run_type === "full" ? "Full" : "Incremental"}
        />
        <SummaryCard label="Objects" value={String(manifest.objects.length)} />
        <SummaryCard
          label="Failed Objects"
          value={String(manifest.objects.filter((o) => o.status === "error").length)}
          warn={manifest.objects.some((o) => o.status === "error")}
        />
        <SummaryCard
          label="Records Exported"
          value={totalRecords.toLocaleString()}
        />
        <SummaryCard label="Duration" value={durationLabel} />
      </div>

      {/* Data objects table */}
      {manifest.objects.length > 0 && (
        <section className="mb-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Data Objects</h2>
            </div>
            <ObjectTable objects={manifest.objects} dataFiles={dataFiles} />
          </div>
        </section>
      )}

      {/* Metadata result */}
      {manifest.metadata && (
        <section className="mb-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Metadata Backup</h2>
              <StatusBadge status={manifest.metadata.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <DetailItem label="Types Retrieved" value={String(manifest.metadata.types_retrieved ?? "—")} />
              <DetailItem label="Zip Size" value={manifest.metadata.zip_size_bytes != null ? formatBytes(manifest.metadata.zip_size_bytes) : "—"} />
            </dl>
          </div>
        </section>
      )}

      {/* Files result */}
      {manifest.files && (
        <section className="mb-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">File Attachments</h2>
              <StatusBadge status={manifest.files.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <DetailItem
                label="Files Backed Up"
                value={String(manifest.files.count ?? "—")}
              />
              <DetailItem
                label="Total Size"
                value={manifest.files.total_size_bytes != null ? formatBytes(manifest.files.total_size_bytes) : "—"}
              />
            </dl>
          </div>
        </section>
      )}

      {/* Global errors */}
      {globalErrors.length > 0 && (
        <section className="mb-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-3">
              Errors ({globalErrors.length})
            </h2>
            <ul className="space-y-2">
              {globalErrors.map((err, idx) => (
                <li key={idx} className="text-sm text-red-700 font-mono bg-red-100 rounded p-2">
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
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-red-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  err,
}: {
  label: string;
  value: string;
  err?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 font-medium ${err ? "text-red-600" : "text-slate-700"} break-all`}>
        {value}
      </dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
