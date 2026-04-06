"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export default function AddOrganizationPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");

  useEffect(() => {
    async function loadTenant() {
      const supabase = createClient();
      const { data } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .eq("id", tenantId)
        .single();

      if (data) {
        setTenant(data);
      }
      setLoading(false);
    }
    loadTenant();
  }, [tenantId]);

  function handleConnect() {
    // Redirect to Salesforce OAuth with tenant context
    const state = JSON.stringify({
      tenantId,
      environment,
      returnUrl: `/settings/tenants/${tenantId}`,
    });
    const encodedState = encodeURIComponent(btoa(state));
    
    // Redirect to our OAuth authorize endpoint
    window.location.href = `/api/auth/salesforce/authorize?state=${encodedState}&environment=${environment}`;
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
        <Link href={`/settings/tenants/${tenantId}`} className="hover:text-foreground transition-colors">{tenant.name}</Link>
        <span>/</span>
        <span className="text-foreground">Add Organization</span>
      </div>

      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Connect Salesforce Organization
          </h1>
          <p className="text-muted-foreground">
            Connect a Salesforce org to <span className="text-foreground font-medium">{tenant.name}</span> by 
            signing in with your Salesforce credentials.
          </p>
        </div>

        {/* Environment Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-foreground mb-3">
            Salesforce Environment
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setEnvironment("production")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                environment === "production"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  environment === "production" ? "bg-primary/10" : "bg-secondary"
                }`}>
                  <svg className={`w-5 h-5 ${environment === "production" ? "text-primary" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </div>
                <div>
                  <p className={`font-semibold ${environment === "production" ? "text-foreground" : "text-muted-foreground"}`}>
                    Production
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect to your live Salesforce environment at login.salesforce.com
              </p>
            </button>

            <button
              onClick={() => setEnvironment("sandbox")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                environment === "sandbox"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  environment === "sandbox" ? "bg-primary/10" : "bg-secondary"
                }`}>
                  <svg className={`w-5 h-5 ${environment === "sandbox" ? "text-primary" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                </div>
                <div>
                  <p className={`font-semibold ${environment === "sandbox" ? "text-foreground" : "text-muted-foreground"}`}>
                    Sandbox
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect to a test environment at test.salesforce.com
              </p>
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-secondary/50 border border-border mb-8">
          <h4 className="font-medium text-foreground mb-2">What happens next?</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">1.</span>
              You&apos;ll be redirected to Salesforce to sign in
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">2.</span>
              Authorize the backup application to access your org
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">3.</span>
              We&apos;ll securely store the connection and start your backups
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            Connect with Salesforce
          </button>
          <Link
            href={`/settings/tenants/${tenantId}`}
            className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
