import { getAllClientConfigs, getClientSummary } from "@/lib/clients";
import { ClientCard } from "@/components/ClientCard";
import type { ClientConfig, ClientSummary, RunStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// Create a fallback summary when Google Drive isn't accessible
function createFallbackSummary(config: ClientConfig): ClientSummary {
  return {
    slug: config.client_slug,
    name: config.client_name,
    sf_environment: config.sf_environment,
    last_run: null,
    total_runs: 0,
    drive_root_folder_id: config.drive.root_folder_id,
    retention_days: config.retention_days,
  };
}

async function loadSummaries(): Promise<ClientSummary[]> {
  const configs = getAllClientConfigs();
  
  const results = await Promise.allSettled(
    configs.map((cfg) => getClientSummary(cfg))
  );
  
  // Map results, using fallback summaries for failed requests
  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    } else {
      // Return fallback summary so organization still appears in list
      return createFallbackSummary(configs[i]);
    }
  });
}

function computeStatus(s: ClientSummary): RunStatus {
  const m = s.last_run?.manifest;
  if (!m) return s.last_run ? "running" : "skipped";
  if (m.errors.length > 0 || m.objects.some((o) => o.status === "error"))
    return "partial";
  return "success";
}

export default async function HomePage() {
  const summaries = await loadSummaries();

  const total = summaries.length;
  const healthy = summaries.filter((s) => computeStatus(s) === "success").length;
  const partial = summaries.filter((s) => computeStatus(s) === "partial").length;
  const running = summaries.filter((s) => computeStatus(s) === "running").length;

  // Calculate totals
  const totalRecords = summaries.reduce((acc, s) => {
    return (
      acc +
      (s.last_run?.manifest?.objects.reduce(
        (sum, o) => sum + (o.record_count ?? 0),
        0
      ) ?? 0)
    );
  }, 0);

  const totalBackups = summaries.reduce((acc, s) => acc + s.total_runs, 0);

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Hero Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          Operations Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor and manage your Salesforce organization backups
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Organizations"
          value={total}
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
                d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
              />
            </svg>
          }
        />
        <StatCard
          label="Healthy"
          value={healthy}
          trend={total > 0 ? Math.round((healthy / total) * 100) : 0}
          trendLabel="of total"
          variant="success"
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
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Needs Attention"
          value={partial}
          variant={partial > 0 ? "warning" : "default"}
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
        <StatCard
          label="Running"
          value={running}
          variant={running > 0 ? "info" : "default"}
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          }
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="glass-card gradient-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Records Protected</p>
              <p className="text-2xl font-bold text-foreground mt-1 font-mono">
                {totalRecords.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
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
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="glass-card gradient-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Backup Runs</p>
              <p className="text-2xl font-bold text-foreground mt-1 font-mono">
                {totalBackups.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-info"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="glass-card gradient-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">System Status</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <p className="text-lg font-semibold text-success">Operational</p>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Organizations Section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Organizations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summaries.length} connected Salesforce organization
            {summaries.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Client grid */}
      {summaries.length === 0 ? (
        <div className="glass-card gradient-border p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-muted-foreground"
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
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No organizations connected
          </h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            Get started by adding your first Salesforce organization. Configure
            automated backups and protect your critical business data.
          </p>
          <a
            href="/setup"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
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
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Organization
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <ClientCard key={s.slug} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  trendLabel,
  variant = "default",
  icon,
}: {
  label: string;
  value: number;
  trend?: number;
  trendLabel?: string;
  variant?: "default" | "success" | "warning" | "error" | "info";
  icon?: React.ReactNode;
}) {
  const variantStyles = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
    info: "text-info",
  };

  const iconBgStyles = {
    default: "bg-secondary",
    success: "bg-success/10",
    warning: "bg-warning/10",
    error: "bg-error/10",
    info: "bg-info/10",
  };

  const iconColorStyles = {
    default: "text-muted-foreground",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
    info: "text-info",
  };

  return (
    <div className="glass-card gradient-border stat-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-3xl font-bold mt-1 font-mono ${variantStyles[variant]}`}>
            {value}
          </p>
          {trend !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {trend}% {trendLabel}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-lg ${iconBgStyles[variant]} flex items-center justify-center ${iconColorStyles[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
