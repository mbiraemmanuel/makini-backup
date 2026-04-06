"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ServiceUser {
  id: string;
  name: string;
  service_type: string;
  is_active: boolean;
}

interface Organization {
  id: string;
  slug: string;
  name: string;
  sf_environment: string;
  sf_username: string | null;
  is_active: boolean;
}

interface Tenant {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
  service_users: ServiceUser[];
  organizations: Organization[];
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", slug: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    const supabase = createClient();
    const { data: tenantsData, error } = await supabase
      .from("tenants")
      .select(`
        *,
        service_users (*),
        organizations (*)
      `)
      .order("created_at", { ascending: false });

    if (!error && tenantsData) {
      setTenants(tenantsData as Tenant[]);
    }
    setLoading(false);
  }

  async function createTenant() {
    if (!newTenant.name || !newTenant.slug) return;
    setCreating(true);

    const supabase = createClient();
    const { error } = await supabase.from("tenants").insert({
      name: newTenant.name,
      slug: newTenant.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    });

    if (!error) {
      setNewTenant({ name: "", slug: "" });
      setShowCreateModal(false);
      loadTenants();
    }
    setCreating(false);
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

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-foreground">Tenants</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer companies and their Salesforce organizations
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Tenant
        </button>
      </div>

      {/* Tenants List */}
      {tenants.length === 0 ? (
        <div className="text-center py-16 px-6 border border-dashed border-border rounded-xl">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No tenants yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your first tenant to start managing Salesforce backups for a customer company.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create First Tenant
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div
              key={tenant.id}
              className="border border-border rounded-xl bg-card overflow-hidden"
            >
              {/* Tenant Header */}
              <div className="p-5 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {tenant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{tenant.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        tenant.is_active 
                          ? "bg-success/10 text-success" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {tenant.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/tenants/${tenant.id}`}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Settings
                  </Link>
                  <Link
                    href={`/settings/tenants/${tenant.id}/organizations/new`}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Add Organization
                  </Link>
                </div>
              </div>

              {/* Organizations */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Salesforce Organizations ({tenant.organizations?.length || 0})
                  </h4>
                </div>

                {tenant.organizations?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {tenant.organizations.map((org) => (
                      <Link
                        key={org.id}
                        href={`/clients/${org.slug}`}
                        className="p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {org.name}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            org.sf_environment === "production"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-warning/10 text-warning"
                          }`}>
                            {org.sf_environment}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{org.sf_username || org.slug}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-border rounded-lg">
                    <p className="text-sm text-muted-foreground mb-3">
                      No Salesforce organizations connected
                    </p>
                    <Link
                      href={`/settings/tenants/${tenant.id}/organizations/new`}
                      className="text-sm text-primary hover:underline"
                    >
                      Connect your first org
                    </Link>
                  </div>
                )}

                {/* Service Users Summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        Service Users: {tenant.service_users?.length || 0}
                      </span>
                      {tenant.service_users?.map((su) => (
                        <span
                          key={su.id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                            su.service_type === "gcs"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-amber-500/10 text-amber-500"
                          }`}
                        >
                          {su.service_type.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={`/settings/tenants/${tenant.id}#service-users`}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Create New Tenant</h2>
            <p className="text-sm text-muted-foreground mb-6">
              A tenant represents a customer company that will use this backup service.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="Acme Corporation"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Slug (URL identifier)
                </label>
                <input
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                  placeholder="acme-corp"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTenant}
                disabled={creating || !newTenant.name || !newTenant.slug}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creating..." : "Create Tenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
