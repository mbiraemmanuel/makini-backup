"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  sf_environment: string;
  sf_username: string | null;
  sf_instance_url: string | null;
  is_active: boolean;
  data_backup_cron: string;
  metadata_backup_cron: string;
  retention_days: number;
  storage_backend: string;
  gcs_bucket_name: string | null;
  drive_root_folder_id: string | null;
}

export default function TenantEditPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenant() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .single();

      if (error || !data) {
        setError("Tenant not found");
      } else {
        setTenant(data);
      }
      setLoading(false);
    }
    loadTenant();
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenant) return;

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({
        name: tenant.name,
        sf_environment: tenant.sf_environment,
        sf_username: tenant.sf_username,
        sf_instance_url: tenant.sf_instance_url,
        is_active: tenant.is_active,
        data_backup_cron: tenant.data_backup_cron,
        metadata_backup_cron: tenant.metadata_backup_cron,
        retention_days: tenant.retention_days,
        storage_backend: tenant.storage_backend,
        gcs_bucket_name: tenant.gcs_bucket_name,
        drive_root_folder_id: tenant.drive_root_folder_id,
      })
      .eq("id", tenantId);

    if (error) {
      setError(error.message);
    } else {
      router.push("/settings/tenants");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-foreground mb-2">Tenant not found</h2>
          <Link href="/settings/tenants" className="text-primary hover:underline">
            Back to Tenants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
          <span>/</span>
          <Link href="/settings/tenants" className="hover:text-foreground transition-colors">Tenants</Link>
          <span>/</span>
          <span className="text-foreground">{tenant.name}</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Edit Tenant</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
        {/* Basic Info */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                type="text"
                value={tenant.name}
                onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Slug</label>
              <input
                type="text"
                value={tenant.slug}
                disabled
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">Slug cannot be changed</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_active"
                checked={tenant.is_active}
                onChange={(e) => setTenant({ ...tenant, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-foreground">
                Active
              </label>
            </div>
          </div>
        </div>

        {/* Salesforce Config */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4">Salesforce Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Environment</label>
              <select
                value={tenant.sf_environment}
                onChange={(e) => setTenant({ ...tenant, sf_environment: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="production">Production</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Username</label>
              <input
                type="text"
                value={tenant.sf_username || ""}
                onChange={(e) => setTenant({ ...tenant, sf_username: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Instance URL</label>
              <input
                type="url"
                value={tenant.sf_instance_url || ""}
                onChange={(e) => setTenant({ ...tenant, sf_instance_url: e.target.value })}
                placeholder="https://your-instance.salesforce.com"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Backup Schedule */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4">Backup Schedule</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Data Backup Cron</label>
              <input
                type="text"
                value={tenant.data_backup_cron}
                onChange={(e) => setTenant({ ...tenant, data_backup_cron: e.target.value })}
                placeholder="0 2 * * *"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1">Cron expression for data backups</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Metadata Backup Cron</label>
              <input
                type="text"
                value={tenant.metadata_backup_cron}
                onChange={(e) => setTenant({ ...tenant, metadata_backup_cron: e.target.value })}
                placeholder="0 3 * * 0"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground mt-1">Cron expression for metadata backups</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Retention Days</label>
              <input
                type="number"
                value={tenant.retention_days}
                onChange={(e) => setTenant({ ...tenant, retention_days: parseInt(e.target.value) || 30 })}
                min={1}
                max={365}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Storage Config */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4">Storage Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Storage Backend</label>
              <select
                value={tenant.storage_backend}
                onChange={(e) => setTenant({ ...tenant, storage_backend: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="gcs">Google Cloud Storage</option>
                <option value="drive">Google Drive</option>
              </select>
            </div>
            {tenant.storage_backend === "gcs" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">GCS Bucket Name</label>
                <input
                  type="text"
                  value={tenant.gcs_bucket_name || ""}
                  onChange={(e) => setTenant({ ...tenant, gcs_bucket_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}
            {tenant.storage_backend === "drive" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Drive Root Folder ID</label>
                <input
                  type="text"
                  value={tenant.drive_root_folder_id || ""}
                  onChange={(e) => setTenant({ ...tenant, drive_root_folder_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <Link
            href="/settings/tenants"
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
