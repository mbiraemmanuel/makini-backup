"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ServiceUser {
  id: string;
  name: string;
  description: string | null;
  service_type: string;
  is_active: boolean;
  last_used_at: string | null;
}

interface Organization {
  id: string;
  slug: string;
  name: string;
  sf_environment: string;
  sf_username: string | null;
  sf_instance_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface Tenant {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [serviceUsers, setServiceUsers] = useState<ServiceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedName, setEditedName] = useState("");

  useEffect(() => {
    loadData();
  }, [tenantId]);

  async function loadData() {
    const supabase = createClient();

    // Load tenant
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (tenantData) {
      setTenant(tenantData);
      setEditedName(tenantData.name);
    }

    // Load organizations
    const { data: orgsData } = await supabase
      .from("organizations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (orgsData) {
      setOrganizations(orgsData);
    }

    // Load service users
    const { data: usersData } = await supabase
      .from("service_users")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (usersData) {
      setServiceUsers(usersData);
    }

    setLoading(false);
  }

  async function saveTenant() {
    if (!tenant) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({ name: editedName })
      .eq("id", tenantId);

    if (!error) {
      setTenant({ ...tenant, name: editedName });
      setEditMode(false);
    }
    setSaving(false);
  }

  async function toggleTenantActive() {
    if (!tenant) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({ is_active: !tenant.is_active })
      .eq("id", tenantId);

    if (!error) {
      setTenant({ ...tenant, is_active: !tenant.is_active });
    }
  }

  async function deleteServiceUser(id: string) {
    if (!confirm("Are you sure you want to delete this service user?")) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("service_users")
      .delete()
      .eq("id", id);

    if (!error) {
      setServiceUsers(serviceUsers.filter((u) => u.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-secondary rounded" />
          <div className="h-64 bg-secondary rounded-lg" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-foreground mb-2">Tenant not found</h2>
          <Link href="/settings/tenants" className="text-primary hover:underline">
            Back to tenants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
        <span>/</span>
        <Link href="/settings/tenants" className="hover:text-foreground transition-colors">Tenants</Link>
        <span>/</span>
        <span className="text-foreground">{tenant.name}</span>
      </div>

      {/* Tenant Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {tenant.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            {editMode ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xl font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
                <button
                  onClick={saveTenant}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                >
                  {saving ? "..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setEditedName(tenant.name);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
                <button
                  onClick={() => setEditMode(true)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-muted-foreground">{tenant.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTenantActive}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tenant.is_active
                ? "bg-success/10 text-success hover:bg-success/20"
                : "bg-destructive/10 text-destructive hover:bg-destructive/20"
            }`}
          >
            {tenant.is_active ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      {/* Organizations Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Salesforce Organizations</h2>
          <Link
            href={`/settings/tenants/${tenantId}/organizations/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Connect Organization
          </Link>
        </div>

        {organizations.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <p className="text-muted-foreground mb-4">No Salesforce organizations connected yet</p>
            <Link
              href={`/settings/tenants/${tenantId}/organizations/new`}
              className="text-sm text-primary hover:underline"
            >
              Connect your first organization
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{org.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        org.sf_environment === "production"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-warning/10 text-warning"
                      }`}>
                        {org.sf_environment}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{org.sf_username || org.slug}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                    org.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? "bg-success" : "bg-muted-foreground"}`} />
                    {org.is_active ? "Connected" : "Disconnected"}
                  </span>
                </div>
                {org.sf_instance_url && (
                  <p className="text-xs text-muted-foreground mb-3 truncate">{org.sf_instance_url}</p>
                )}
                <div className="flex items-center gap-2">
                  <Link
                    href={`/clients/${org.slug}`}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    View Dashboard
                  </Link>
                  <Link
                    href={`/settings/tenants/${tenantId}/organizations/${org.id}`}
                    className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service Users Section */}
      <div id="service-users">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Service Users</h2>
            <p className="text-sm text-muted-foreground">Storage credentials for backups (GCS, Drive)</p>
          </div>
          <Link
            href={`/settings/tenants/${tenantId}/service-users/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Service User
          </Link>
        </div>

        {serviceUsers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <p className="text-muted-foreground mb-4">No service users configured</p>
            <Link
              href={`/settings/tenants/${tenantId}/service-users/new`}
              className="text-sm text-primary hover:underline"
            >
              Add your first service user
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {serviceUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    user.service_type === "gcs"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-amber-500/10 text-amber-500"
                  }`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        user.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {user.service_type.toUpperCase()}
                      {user.description && ` - ${user.description}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/tenants/${tenantId}/service-users/${user.id}`}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </Link>
                  <button
                    onClick={() => deleteServiceUser(user.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
