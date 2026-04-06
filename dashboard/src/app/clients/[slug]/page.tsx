import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientConfig } from "@/lib/clients";
import { listBackupFolders, buildBackupRun } from "@/lib/drive";
import { listGCSRunDates, buildGCSBackupRun } from "@/lib/gcs";
import { RunTable } from "@/components/RunTable";
import { RunBackupButton } from "@/components/RunBackupButton";
import type { BackupRun } from "@/lib/types";

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

  if (isGCS) {
    allDates = await listGCSRunDates(slug);
    totalPages = Math.ceil(allDates.length / limit);
    const pageDates = allDates.slice(offset, offset + limit);
    const runResults = await Promise.allSettled(
      pageDates.map((date) => buildGCSBackupRun(slug, date))
    );
    runs = runResults
      .filter((r): r is PromiseFulfilledResult<BackupRun> => r.status === "fulfilled")
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
      .filter((r): r is PromiseFulfilledResult<BackupRun> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    storageUrl = `https://drive.google.com/drive/folders/${config.drive.root_folder_id}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-700">
          Dashboard
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-800 font-medium">{config.client_name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{config.client_name}</h1>
          <p className="text-slate-500 text-sm mt-1">
          {config.sf_environment} environment
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${slug}/edit`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm"
          >
            Edit Config
          </Link>
          <RunBackupButton slug={slug} />
          <a
            href={storageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            {isGCS ? "Open in GCS ↗" : "Open in Drive ↗"}
          </a>
        </div>
      </div>

      {/* Config meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetaCard label="Retention" value={`${config.retention_days} days`} />
        <MetaCard label="Environment" value={config.sf_environment} />
        <MetaCard label="Total Runs" value={String(allDates.length)} />
        <MetaCard label="SF Username" value={config.sf_username} small />
      </div>

      {/* Run table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Backup History</h2>
        </div>
        {runs.length === 0 ? (
          <p className="px-6 py-10 text-slate-500 text-center">No backup runs found.</p>
        ) : (
          <RunTable runs={runs} slug={slug} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-slate-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/clients/${slug}?page=${page - 1}`}
                className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/clients/${slug}?page=${page + 1}`}
                className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-semibold text-slate-800 ${small ? "text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
