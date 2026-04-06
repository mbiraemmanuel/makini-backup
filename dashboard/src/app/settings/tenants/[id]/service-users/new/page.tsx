"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export default function NewServiceUserPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    service_type: "salesforce" as "salesforce" | "gcs" | "drive",
    credentials: {} as Record<string, string>,
  });

  useEffect(() => {
    async function loadTenant() {
      const supabase = createClient();
      const { data } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .eq("id", tenantId)
        .single();

      if (data) setTenant(data);
      setLoading(false);
    }
    loadTenant();
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("service_users").insert({
      tenant_id: tenantId,
      name: formData.name,
      description: formData.description,
      service_type: formData.service_type,
      credentials: formData.credentials,
      is_active: true,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      router.push("/settings/tenants");
    }
  };

  const updateCredential = (key: string, value: string) => {
    setFormData({
      ...formData,
      credentials: { ...formData.credentials, [key]: value },
    });
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
          <span className="text-foreground">{tenant?.name || "..."}</span>
          <span>/</span>
          <span className="text-foreground">New Service User</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Add Service User</h1>
        <p className="text-muted-foreground mt-1">
          Configure a service account for {tenant?.name}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Basic Info */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4">Service User Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Backup Service"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Service Type</label>
              <select
                value={formData.service_type}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  service_type: e.target.value as "salesforce" | "gcs" | "drive",
                  credentials: {} 
                })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="salesforce">Salesforce</option>
                <option value="gcs">Google Cloud Storage</option>
                <option value="drive">Google Drive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Salesforce Credentials */}
        {formData.service_type === "salesforce" && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h2 className="text-lg font-semibold text-foreground mb-4">Salesforce Credentials</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Consumer Key</label>
                <input
                  type="text"
                  value={formData.credentials.consumer_key || ""}
                  onChange={(e) => updateCredential("consumer_key", e.target.value)}
                  placeholder="Connected App Consumer Key"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Consumer Secret</label>
                <input
                  type="password"
                  value={formData.credentials.consumer_secret || ""}
                  onChange={(e) => updateCredential("consumer_secret", e.target.value)}
                  placeholder="Connected App Consumer Secret"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Private Key (PEM)</label>
                <textarea
                  value={formData.credentials.private_key || ""}
                  onChange={(e) => updateCredential("private_key", e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* GCS Credentials */}
        {formData.service_type === "gcs" && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h2 className="text-lg font-semibold text-foreground mb-4">GCS Service Account</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Service Account JSON</label>
                <textarea
                  value={formData.credentials.service_account_json || ""}
                  onChange={(e) => updateCredential("service_account_json", e.target.value)}
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste the full JSON key file from Google Cloud Console
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Drive Credentials */}
        {formData.service_type === "drive" && (
          <div className="p-6 rounded-xl border border-border bg-card">
            <h2 className="text-lg font-semibold text-foreground mb-4">Google Drive Service Account</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Service Account JSON</label>
                <textarea
                  value={formData.credentials.service_account_json || ""}
                  onChange={(e) => updateCredential("service_account_json", e.target.value)}
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste the full JSON key file from Google Cloud Console
                </p>
              </div>
            </div>
          </div>
        )}

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
            {saving ? "Creating..." : "Create Service User"}
          </button>
        </div>
      </form>
    </div>
  );
}
