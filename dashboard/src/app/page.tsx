import { getAllClientConfigs, getClientSummary } from "@/lib/clients";
import { ClientCard } from "@/components/ClientCard";
import type { ClientSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadSummaries(): Promise<ClientSummary[]> {
  const configs = getAllClientConfigs();
  const results = await Promise.allSettled(configs.map((cfg) => getClientSummary(cfg)));
  return results
    .filter((r): r is PromiseFulfilledResult<ClientSummary> => r.status === "fulfilled")
    .map((r) => r.value);
}

export default async function HomePage() {
  const summaries = await loadSummaries();

  const total = summaries.length;

  function computeStatus(s: ClientSummary): string {
    const m = s.last_run?.manifest;
    if (!m) return s.last_run ? "running" : "skipped";
    if (m.errors.length > 0 || m.objects.some((o) => o.status === "error")) return "partial";
    return "success";
  }

  const healthy = summaries.filter((s) => computeStatus(s) === "success").length;
  const partial = summaries.filter((s) => computeStatus(s) === "partial").length;
  const errored = summaries.filter((s) => computeStatus(s) === "error").length;

  return (
    <div>
      {/* Hero banner */}
      <div className="bg-brand-900 text-white py-10 px-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Operations Dashboard</h1>
        <p className="mt-1 text-brand-200">Makini Consulting · Salesforce Backup Service</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Clients" value={total} color="text-slate-700" />
          <StatCard label="Healthy" value={healthy} color="text-emerald-600" />
          <StatCard label="Partial" value={partial} color="text-amber-500" />
          <StatCard label="Errors" value={errored} color="text-red-600" />
        </div>

        {/* Client grid */}
        {summaries.length === 0 ? (
          <p className="text-slate-500 text-center py-16">
            No client configurations found. Add a JSON file to the clients/ directory.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {summaries.map((s) => (
              <ClientCard key={s.slug} summary={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}
