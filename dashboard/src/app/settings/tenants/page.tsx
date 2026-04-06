"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  sf_environment: string;
  sf_username: string | null;
  is_active: boolean;
  setup_completed_at: string | null;
  created_at: string;
  storage_backend: string;
  retention_days: number;
}

interface ServiceUser {
  id: string;
  tenant_id: string;
  name: string;
  service_type: string;
  is_active: boolean;
}

export default function TenantsManagementPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [serviceUsers, setServiceUsers] = useState<Record<string, ServiceUser[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      
      // Load tenants
      const { data: tenantsData } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (tenantsData) {
        setTenants(tenantsData);
        
        // Load service users for all tenants
        const { data: usersData } = await supabase
          .from("service_users")
          .select("*")
          .in("tenant_id", tenantsData.map(t => t.id));
        
        if (usersData) {
          const grouped = usersData.reduce((acc, user) => {
            if (!acc[user.tenant_id]) acc[user.tenant_id] = [];
            acc[user.tenant_id].push(user);
            return acc;
          }, {} as Record<string, ServiceUser[]>);
          setServiceUsers(grouped);
        }
      }
      
      setLoading(false);
    }
    loadData();
  }, []);

  const toggleTenant = (id: string) => {
    setExpandedTenant(expandedTenant === id ? null : id);
  };

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-foreground">Tenant Management</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Tenant Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage organizations, service users, and their credentials
          </p>
        </div>
        <Link
          href="/setup/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Tenant
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No tenants configured</h3>
          <p className="text-muted-foreground mb-6">Add your first tenant to get started.</p>
          <Link
            href="/setup/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Add First Tenant
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="border border-border rounded-xl bg-card overflow-hidden">
              {/* Tenant Header */}
              <button
                onClick={() => toggleTenant(tenant.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">
                      {tenant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{tenant.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        tenant.sf_environment === "production"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {tenant.sf_environment}
                      </span>
                      {!tenant.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">
                      {serviceUsers[tenant.id]?.length || 0} service user{(serviceUsers[tenant.id]?.length || 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-muted-foreground transition-transform ${expandedTenant === tenant.id ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedTenant === tenant.id && (
                <div className="border-t border-border">
                  {/* Tenant Details */}
                  <div className="px-6 py-4 bg-secondary/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Username</p>
                        <p className="text-sm font-medium text-foreground">{tenant.sf_username || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Storage</p>
                        <p className="text-sm font-medium text-foreground uppercase">{tenant.storage_backend}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Retention</p>
                        <p className="text-sm font-medium text-foreground">{tenant.retention_days} days</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                        <p className={`text-sm font-medium ${tenant.setup_completed_at ? "text-success" : "text-warning"}`}>
                          {tenant.setup_completed_at ? "Active" : "Setup Pending"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Service Users */}
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-foreground">Service Users</h4>
                      <Link
                        href={`/settings/tenants/${tenant.id}/service-users/new`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Service User
                      </Link>
                    </div>

                    {!serviceUsers[tenant.id] || serviceUsers[tenant.id].length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                        No service users configured
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {serviceUsers[tenant.id].map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center justify-between px-4 py-3 rounded-lg bg-secondary/30 border border-border"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                user.service_type === "salesforce"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : user.service_type === "gcs"
                                  ? "bg-green-500/10 text-green-400"
                                  : "bg-amber-500/10 text-amber-400"
                              }`}>
                                {user.service_type === "salesforce" ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                                  </svg>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{user.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{user.service_type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                user.is_active
                                  ? "bg-success/10 text-success"
                                  : "bg-destructive/10 text-destructive"
                              }`}>
                                <span className={`w-1 h-1 rounded-full ${user.is_active ? "bg-success" : "bg-destructive"}`} />
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                              <Link
                                href={`/settings/tenants/${tenant.id}/service-users/${user.id}`}
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-6 py-4 border-t border-border bg-secondary/10 flex items-center justify-between">
                    <Link
                      href={`/clients/${tenant.slug}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View Dashboard
                    </Link>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/settings/tenants/${tenant.id}`}
                        className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        Edit Tenant
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
