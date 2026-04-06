/**
 * POST /api/setup
 *
 * Body: SetupPayload
 * Actions performed server-side:
 *   1. test_salesforce — exchange JWT, return instance_url
 *   2. test_drive      — list folder with provided SA JSON
 *   3. save            — write client config JSON + patch .env.local
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

// ── types ────────────────────────────────────────────────────────────────────

export interface SetupPayload {
  action: "generate_keys" | "test_salesforce" | "test_drive" | "save";
  // Salesforce
  client_slug?: string;
  client_name?: string;
  sf_username?: string;
  sf_environment?: "production" | "sandbox";
  sf_api_version?: string;
  consumer_key?: string;
  private_key_pem?: string;
  // Google
  sa_json_text?: string;     // raw JSON string of the service account key
  drive_folder_id?: string;
  // Extra
  retention_days?: number;
  notify_email?: string;
  gcp_project?: string;
  gcp_region?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function generateKeys(): Promise<{ private_pem: string; cert_pem: string }> {
  // Use selfsigned for pure-JS X.509 generation (no openssl needed, fully cross-platform)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const selfsigned = require("selfsigned");

  const attrs = [{ name: "commonName", value: "sf-backup" }];
  // selfsigned v3+ is async; options cast to any because TS types lag the implementation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pems = await (selfsigned.generate(attrs, { keySize: 2048, days: 730, algorithm: "sha256" } as any) as Promise<any>);

  return { private_pem: pems.private as string, cert_pem: pems.cert as string };
}

const SF_ENDPOINTS: Record<string, string> = {
  production: "https://login.salesforce.com/services/oauth2/token",
  sandbox: "https://test.salesforce.com/services/oauth2/token",
};

async function testSalesforce(payload: SetupPayload): Promise<{ instance_url: string }> {
  const { consumer_key, sf_username, private_key_pem, sf_environment = "production" } = payload;
  if (!consumer_key || !sf_username || !private_key_pem) {
    throw new Error("consumer_key, sf_username, and private_key_pem are required.");
  }

  const endpoint = SF_ENDPOINTS[sf_environment];
  const audience = endpoint.replace("/services/oauth2/token", "");
  const now = Math.floor(Date.now() / 1000);

  const assertion = jwt.sign(
    { iss: consumer_key, sub: sf_username, aud: audience, exp: now + 300 },
    private_key_pem,
    { algorithm: "RS256" }
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const instance_url: string = data.instance_url;
  if (!instance_url) throw new Error(`No instance_url in response: ${JSON.stringify(data)}`);
  return { instance_url };
}

async function testDrive(payload: SetupPayload): Promise<{ sa_email: string }> {
  const { sa_json_text, drive_folder_id } = payload;
  if (!sa_json_text || !drive_folder_id) {
    throw new Error("sa_json_text and drive_folder_id are required.");
  }

  let saJson: Record<string, string>;
  try {
    saJson = JSON.parse(sa_json_text);
  } catch {
    throw new Error("Service account JSON is not valid JSON.");
  }

  // Build a Google OAuth 2.0 access token for the service account
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: saJson,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });
  await drive.files.list({
    q: `'${drive_folder_id}' in parents and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return { sa_email: saJson.client_email ?? "unknown" };
}

async function saveConfig(payload: SetupPayload, instanceUrl: string): Promise<void> {
  const {
    client_slug,
    client_name,
    sf_username,
    sf_environment = "production",
    sf_api_version = "59.0",
    consumer_key,
    sa_json_text,
    drive_folder_id,
    retention_days = 90,
    notify_email,
    gcp_project = "",
    gcp_region = "us-central1",
  } = payload;

  if (!client_slug || !client_name || !sf_username || !consumer_key) {
    throw new Error("Missing required fields for save.");
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const clientsDir = path.join(repoRoot, "clients");
  fs.mkdirSync(clientsDir, { recursive: true });

  const config = {
    client_slug,
    client_name,
    sf_username,
    sf_api_version,
    sf_environment,
    sf_instance_url: instanceUrl,
    consumer_key,
    backup: {
      data: {
        enabled: true,
        schedule_cron: "0 2 * * *",
        schedule_timezone: "America/Chicago",
        incremental: true,
        object_exclusions: [],
        object_inclusions: [],
      },
      metadata: {
        enabled: true,
        schedule_cron: "0 3 * * 0",
        schedule_timezone: "America/Chicago",
        metadata_type_exclusions: [],
      },
      files: {
        enabled: false,
        schedule_cron: "0 4 * * 0",
        max_file_size_mb: 500,
        storage_backend: "drive",
      },
    },
    retention_days,
    drive: { root_folder_id: drive_folder_id, storage_backend: "drive" },
    notifications: {
      alert_emails: notify_email ? [notify_email] : [],
      notify_on: ["error", "partial"],
    },
    gcp: {
      project_id: gcp_project,
      region: gcp_region,
      cloud_run_job: `sf-backup-${client_slug}`,
    },
  };

  fs.writeFileSync(
    path.join(clientsDir, `${client_slug}-config.json`),
    JSON.stringify(config, null, 2)
  );

  // Write local secrets file so Python backend can run without Secret Manager
  const privateKeyPem = payload.private_key_pem ?? "";
  if (privateKeyPem || consumer_key || sa_json_text) {
    const secrets = {
      private_key: privateKeyPem,
      consumer_key: consumer_key ?? "",
      username: sf_username ?? "",
      instance_url: instanceUrl,
      sa_json: sa_json_text ?? "",
      sendgrid_api_key: "",
    };
    fs.writeFileSync(
      path.join(clientsDir, `${client_slug}-secrets.json`),
      JSON.stringify(secrets, null, 2)
    );
  }

  // Patch .env.local if SA JSON was provided
  if (sa_json_text) {
    const saB64 = Buffer.from(sa_json_text).toString("base64");
    const envPath = path.join(process.cwd(), ".env.local");
    let existing = "";
    if (fs.existsSync(envPath)) existing = fs.readFileSync(envPath, "utf-8");

    const patchLine = (content: string, key: string, value: string): string => {
      const re = new RegExp(`^${key}=.*$`, "m");
      return re.test(content)
        ? content.replace(re, `${key}=${value}`)
        : content + `\n${key}=${value}`;
    };

    let env = existing;
    env = patchLine(env, "GCP_PROJECT_ID", gcp_project);
    env = patchLine(env, "DASHBOARD_SA_JSON_B64", saB64);
    env = patchLine(env, "CLIENTS_DIR", clientsDir);
    fs.writeFileSync(envPath, env.trim() + "\n");
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const payload: SetupPayload = await req.json();

    if (payload.action === "generate_keys") {
      const result = await generateKeys();
      return NextResponse.json({ ok: true, ...result });
    }

    if (payload.action === "test_salesforce") {
      const result = await testSalesforce(payload);
      return NextResponse.json({ ok: true, ...result });
    }

    if (payload.action === "test_drive") {
      const result = await testDrive(payload);
      return NextResponse.json({ ok: true, ...result });
    }

    if (payload.action === "save") {
      // We need an instance URL; test SF first to get it
      const { instance_url } = await testSalesforce(payload);
      await saveConfig(payload, instance_url);
      return NextResponse.json({ ok: true, instance_url });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
