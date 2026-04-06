"use client";

import { useState, useRef } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientDetails {
  client_slug: string;
  client_name: string;
  sf_username: string;
  sf_environment: "production" | "sandbox";
  sf_api_version: string;
  retention_days: number;
  notify_email: string;
  gcp_project: string;
  gcp_region: string;
}

interface SalesforceDetails {
  consumer_key: string;
  private_key_pem: string;
  cert_pem: string;
  instance_url: string;
}

interface DriveDetails {
  sa_json_text: string;
  sa_email: string;
  drive_folder_id: string;
}

type Step = 1 | 2 | 3 | 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callSetup(body: object): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {help && <p className="text-xs text-slate-400 mb-1">{help}</p>}
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  const { options, ...rest } = props;
  return (
    <select
      {...rest}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 6}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
    />
  );
}

function Btn({
  children,
  onClick,
  loading,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "success";
}) {
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50";
  const styles = {
    primary: "bg-brand-800 hover:bg-brand-900 text-white",
    secondary: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${styles[variant]}`}>
      {loading ? <span className="animate-spin">⟳</span> : null}
      {children}
    </button>
  );
}

function StatusMsg({ ok, msg }: { ok: boolean | null; msg: string }) {
  if (!msg) return null;
  return (
    <p
      className={`text-sm mt-2 px-3 py-2 rounded-lg ${
        ok === true
          ? "bg-emerald-50 text-emerald-800"
          : ok === false
          ? "bg-red-50 text-red-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {ok === true ? "✓ " : ok === false ? "✗ " : "⟳ "}
      {msg}
    </p>
  );
}

function StepIndicator({ step, current }: { step: number; current: Step }) {
  const done = step < current;
  const active = step === current;
  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${active ? "text-brand-800" : done ? "text-emerald-600" : "text-slate-400"}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done ? "bg-emerald-100 text-emerald-700" : active ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? "✓" : step}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [client, setClient] = useState<ClientDetails>({
    client_slug: "",
    client_name: "",
    sf_username: "",
    sf_environment: "production",
    sf_api_version: "59.0",
    retention_days: 90,
    notify_email: "",
    gcp_project: "",
    gcp_region: "us-central1",
  });

  // Step 2 state
  const [sf, setSf] = useState<SalesforceDetails>({
    consumer_key: "",
    private_key_pem: "",
    cert_pem: "",
    instance_url: "",
  });
  const [sfStatus, setSfStatus] = useState<{ ok: boolean | null; msg: string }>({ ok: null, msg: "" });
  const [sfLoading, setSfLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);

  // Step 3 state
  const [drive, setDrive] = useState<DriveDetails>({
    sa_json_text: "",
    sa_email: "",
    drive_folder_id: "",
  });
  const [driveStatus, setDriveStatus] = useState<{ ok: boolean | null; msg: string }>({ ok: null, msg: "" });
  const [driveLoading, setDriveLoading] = useState(false);
  const saFileRef = useRef<HTMLInputElement>(null);

  // Step 4 state
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean | null; msg: string }>({ ok: null, msg: "" });
  const [saveLoading, setSaveLoading] = useState(false);

  // ── Step 2: generate keys ───────────────────────────────────────
  async function handleGenerateKeys() {
    setKeysLoading(true);
    const data = await callSetup({ action: "generate_keys" });
    setKeysLoading(false);
    if (data.ok) {
      setSf((prev) => ({
        ...prev,
        private_key_pem: data.private_pem as string,
        cert_pem: data.cert_pem as string,
      }));
    } else {
      setSfStatus({ ok: false, msg: data.error ?? "Key generation failed." });
    }
  }

  function downloadText(content: string, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = filename;
    a.click();
  }

  // ── Step 2: test Salesforce ─────────────────────────────────────
  async function handleTestSalesforce() {
    setSfLoading(true);
    setSfStatus({ ok: null, msg: "Testing Salesforce connection..." });
    const data = await callSetup({
      action: "test_salesforce",
      ...client,
      ...sf,
    });
    setSfLoading(false);
    if (data.ok) {
      setSf((prev) => ({ ...prev, instance_url: data.instance_url as string }));
      setSfStatus({ ok: true, msg: `Connected! Instance: ${data.instance_url}` });
    } else {
      setSfStatus({ ok: false, msg: data.error ?? "Connection failed." });
    }
  }

  // ── Step 3: load SA JSON from file ─────────────────────────────
  function handleSaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setDrive((prev) => ({ ...prev, sa_json_text: text }));
      try {
        const sa = JSON.parse(text);
        setDrive((prev) => ({ ...prev, sa_email: sa.client_email ?? "" }));
      } catch {
        // not valid JSON yet
      }
    };
    reader.readAsText(file);
  }

  // ── Step 3: test Drive ──────────────────────────────────────────
  async function handleTestDrive() {
    setDriveLoading(true);
    setDriveStatus({ ok: null, msg: "Testing Google Drive access..." });
    const data = await callSetup({ action: "test_drive", ...drive });
    setDriveLoading(false);
    if (data.ok) {
      setDrive((prev) => ({ ...prev, sa_email: data.sa_email as string }));
      setDriveStatus({ ok: true, msg: `Drive folder accessible. SA: ${data.sa_email}` });
    } else {
      setDriveStatus({ ok: false, msg: data.error ?? "Drive test failed." });
    }
  }

  // ── Step 4: save everything ─────────────────────────────────────
  async function handleSave() {
    setSaveLoading(true);
    setSaveStatus({ ok: null, msg: "Saving configuration..." });
    const data = await callSetup({
      action: "save",
      ...client,
      ...sf,
      ...drive,
    });
    setSaveLoading(false);
    if (data.ok) {
      setSaveStatus({ ok: true, msg: "Configuration saved! The client is now visible in the dashboard." });
    } else {
      setSaveStatus({ ok: false, msg: data.error ?? "Save failed." });
    }
  }

  const sfReady = sf.instance_url !== "";
  const driveReady = driveStatus.ok === true;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-sm text-brand-700 hover:text-brand-900">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-3">Add New Client</h1>
        <p className="text-slate-500 text-sm mt-1">
          Connect a Salesforce org and Google Drive to start backing up automatically.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {(["1 Client details", "2 Salesforce auth", "3 Google Drive", "4 Save"] as const).map((label, i) => {
          const s = (i + 1) as Step;
          return (
            <div key={s} className="flex items-center gap-2">
              <StepIndicator step={s} current={step} />
              <span className={`text-xs hidden sm:block ${s === step ? "text-brand-800 font-semibold" : s < step ? "text-emerald-600" : "text-slate-400"}`}>
                {label.slice(2)}
              </span>
              {i < 3 && <div className="w-6 h-px bg-slate-200 hidden sm:block" />}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Client details ─────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-800">Client Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client slug" help="Lowercase letters and hyphens only. E.g. acme-corp">
              <Input
                value={client.client_slug}
                onChange={(e) =>
                  setClient((p) => ({ ...p, client_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))
                }
                placeholder="acme-corp"
              />
            </Field>
            <Field label="Display name">
              <Input
                value={client.client_name}
                onChange={(e) => setClient((p) => ({ ...p, client_name: e.target.value }))}
                placeholder="Acme Corp"
              />
            </Field>
            <Field label="Salesforce username">
              <Input
                value={client.sf_username}
                onChange={(e) => setClient((p) => ({ ...p, sf_username: e.target.value }))}
                placeholder="admin@yourorg.com"
              />
            </Field>
            <Field label="Salesforce environment">
              <Select
                value={client.sf_environment}
                onChange={(e) => setClient((p) => ({ ...p, sf_environment: e.target.value as "production" | "sandbox" }))}
                options={["production", "sandbox"]}
              />
            </Field>
            <Field label="Notification email">
              <Input
                value={client.notify_email}
                onChange={(e) => setClient((p) => ({ ...p, notify_email: e.target.value }))}
                placeholder="ops@yourcompany.com"
              />
            </Field>
            <Field label="Retention (days)">
              <Input
                type="number"
                value={client.retention_days}
                onChange={(e) => setClient((p) => ({ ...p, retention_days: parseInt(e.target.value) || 90 }))}
              />
            </Field>
            <Field label="GCP project ID" help="Optional — required for Cloud Run / Secret Manager">
              <Input
                value={client.gcp_project}
                onChange={(e) => setClient((p) => ({ ...p, gcp_project: e.target.value }))}
                placeholder="my-gcp-project"
              />
            </Field>
            <Field label="GCP region">
              <Input
                value={client.gcp_region}
                onChange={(e) => setClient((p) => ({ ...p, gcp_region: e.target.value }))}
                placeholder="us-central1"
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <Btn
              onClick={() => setStep(2)}
              disabled={!client.client_slug || !client.client_name || !client.sf_username}
            >
              Continue →
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 2: Salesforce authentication ─────────────────────── */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">Salesforce Authentication</h2>

          {/* Generate keys */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Step A — Generate an RSA key pair
            </p>
            <p className="text-xs text-slate-500">
              A private key is used to sign JWT assertions. The certificate is uploaded to Salesforce.
              Your private key never leaves your machine.
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={handleGenerateKeys} loading={keysLoading} variant="secondary">
                Generate keys
              </Btn>
              {sf.cert_pem && (
                <>
                  <Btn
                    onClick={() => downloadText(sf.cert_pem, "certificate.pem")}
                    variant="secondary"
                  >
                    ↓ Download certificate.pem
                  </Btn>
                  <Btn
                    onClick={() => downloadText(sf.private_key_pem, "private.pem")}
                    variant="secondary"
                  >
                    ↓ Download private.pem
                  </Btn>
                </>
              )}
            </div>
            {sf.cert_pem && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded p-2">
                ✓ Keys generated. Download <strong>certificate.pem</strong> — you will upload it to Salesforce in Step B.
              </p>
            )}
          </div>

          {/* Salesforce Connected App guide */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-xs text-blue-800 space-y-1">
            <p className="font-semibold text-sm">Step B — Create a Connected App in Salesforce</p>
            <ol className="list-decimal list-inside space-y-1 mt-1">
              <li>Go to <strong>Setup → App Manager → New Connected App</strong></li>
              <li>Check <strong>Enable OAuth Settings</strong> · Callback URL: any valid URL</li>
              <li>Check <strong>Use digital signatures</strong> · Upload <strong>certificate.pem</strong></li>
              <li>OAuth Scopes: add <strong>Full access (full)</strong></li>
              <li>Save → click <strong>Manage Consumer Details</strong> → copy the Consumer Key</li>
              <li>Manage → Edit Policies → Permitted Users: <strong>Admin approved users are pre-authorized</strong></li>
              <li>Assign a Permission Set / Profile that includes the connected app to your integration user</li>
            </ol>
            <a
              href={client.sf_environment === "sandbox"
                ? "https://test.salesforce.com/lightning/setup/NavigationMenus/home"
                : "https://login.salesforce.com/lightning/setup/NavigationMenus/home"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="underline mt-1 inline-block"
            >
              Open Salesforce Setup ↗
            </a>
          </div>

          {/* Consumer key + private key */}
          <div className="space-y-4">
            <Field label="Consumer Key" help="From 'Manage Consumer Details' in the Connected App">
              <Input
                value={sf.consumer_key}
                onChange={(e) => setSf((p) => ({ ...p, consumer_key: e.target.value.trim() }))}
                placeholder="3MVG9..."
              />
            </Field>
            <Field
              label="Private Key PEM"
              help="Paste the contents of private.pem (or generate above)"
            >
              <Textarea
                value={sf.private_key_pem}
                onChange={(e) => setSf((p) => ({ ...p, private_key_pem: e.target.value }))}
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                rows={8}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Btn
              onClick={handleTestSalesforce}
              loading={sfLoading}
              disabled={!sf.consumer_key || !sf.private_key_pem}
            >
              Test Salesforce Connection
            </Btn>
            <StatusMsg {...sfStatus} />
          </div>

          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(1)}>← Back</Btn>
            <Btn onClick={() => setStep(3)} disabled={!sfReady}>
              Continue →
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 3: Google Drive ────────────────────────────────────── */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">Google Drive — Service Account</h2>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-xs text-blue-800 space-y-1">
            <p className="font-semibold text-sm">Create a Google Cloud service account</p>
            <ol className="list-decimal list-inside space-y-1 mt-1">
              <li>Open <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline">GCP Console → Service Accounts</a></li>
              <li>Create a service account (e.g. <code>sf-backup-{client.client_slug}</code>)</li>
              <li>Keys → Add Key → JSON → download the file</li>
              <li>In Google Drive, right-click your backup folder → Share → paste the SA email → Editor</li>
            </ol>
          </div>

          <Field label="Service Account JSON file" help="Upload the JSON key file downloaded from GCP">
            <div className="flex items-center gap-3">
              <input
                ref={saFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleSaFile}
              />
              <Btn variant="secondary" onClick={() => saFileRef.current?.click()}>
                Choose file
              </Btn>
              {drive.sa_email && (
                <span className="text-xs text-emerald-700 font-medium">✓ {drive.sa_email}</span>
              )}
            </div>
          </Field>

          <Field
            label="Or paste the JSON directly"
            help="The contents of the service account key file"
          >
            <Textarea
              value={drive.sa_json_text}
              onChange={(e) => {
                const text = e.target.value;
                setDrive((p) => ({ ...p, sa_json_text: text }));
                try {
                  const sa = JSON.parse(text);
                  setDrive((p) => ({ ...p, sa_email: sa.client_email ?? "" }));
                } catch {}
              }}
              placeholder='{"type":"service_account","project_id":"..."}'
              rows={5}
            />
          </Field>

          <Field
            label="Drive backup folder ID"
            help="Open the folder in Google Drive → copy the ID from the URL (…/folders/THIS-PART)"
          >
            <Input
              value={drive.drive_folder_id}
              onChange={(e) => setDrive((p) => ({ ...p, drive_folder_id: e.target.value.trim() }))}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <Btn
              onClick={handleTestDrive}
              loading={driveLoading}
              disabled={!drive.sa_json_text || !drive.drive_folder_id}
            >
              Test Drive Access
            </Btn>
            <StatusMsg {...driveStatus} />
          </div>

          <div className="flex justify-between pt-2">
            <Btn variant="secondary" onClick={() => setStep(2)}>← Back</Btn>
            <Btn onClick={() => setStep(4)} disabled={!driveReady}>
              Continue →
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review + Save ───────────────────────────────────── */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">Review & Save</h2>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <ReviewRow label="Client" value={`${client.client_name} (${client.client_slug})`} />
            <ReviewRow label="Salesforce user" value={client.sf_username} />
            <ReviewRow label="Environment" value={client.sf_environment} />
            <ReviewRow label="Instance URL" value={sf.instance_url} />
            <ReviewRow label="Drive folder" value={drive.drive_folder_id} />
            <ReviewRow label="Service account" value={drive.sa_email} />
            <ReviewRow label="Retention" value={`${client.retention_days} days`} />
            <ReviewRow label="Notifications" value={client.notify_email || "—"} />
          </dl>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
            <strong>What gets saved:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><code>clients/{client.client_slug}-config.json</code> — client configuration</li>
              <li><code>dashboard/.env.local</code> — Google service account (base64) + project ID</li>
            </ul>
            <p className="mt-2">The private key PEM is <strong>not</strong> saved to disk by this wizard — download and store it securely.</p>
          </div>

          {saveStatus.ok !== true && (
            <div className="flex flex-col gap-2">
              <Btn onClick={handleSave} loading={saveLoading} variant="success">
                Save Configuration
              </Btn>
              <StatusMsg {...saveStatus} />
            </div>
          )}

          {saveStatus.ok === true && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-5 text-center space-y-3">
              <p className="text-emerald-800 font-semibold text-lg">✓ Setup complete!</p>
              <p className="text-emerald-700 text-sm">
                {client.client_name} is ready. Backups will appear in the dashboard after the first run.
              </p>
              <div className="flex justify-center gap-3 pt-1">
                <Link
                  href="/"
                  className="px-4 py-2 bg-brand-800 hover:bg-brand-900 text-white text-sm font-medium rounded-lg"
                >
                  Go to Dashboard
                </Link>
                <Link
                  href="/setup"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg"
                >
                  Add Another Client
                </Link>
              </div>
            </div>
          )}

          {saveStatus.ok !== true && (
            <div className="flex justify-between pt-2">
              <Btn variant="secondary" onClick={() => setStep(3)}>← Back</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 break-all">{value}</dd>
    </>
  );
}
