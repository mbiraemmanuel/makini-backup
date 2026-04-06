/**
 * GCS helpers for the dashboard — reads run data from the backup buckets.
 * Uses the Google Cloud Storage JSON REST API with the DASHBOARD_SA_JSON_B64 service account.
 * Bucket naming convention: makini-sf-files-{slug}
 * Run prefix convention:   {YYYY-MM-DD}/
 * Manifest location:       {YYYY-MM-DD}/manifest.json
 */
import { GoogleAuth } from "google-auth-library";
import type { Manifest, BackupRun } from "./types";

function buildAuth() {
  // Try base64-encoded first, then raw JSON
  const b64 = process.env.DASHBOARD_SA_JSON_B64;
  const rawJson = process.env.DASHBOARD_SA_JSON;
  
  let credentials;
  
  if (b64) {
    credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  } else if (rawJson) {
    credentials = JSON.parse(rawJson);
  } else {
    throw new Error("Set DASHBOARD_SA_JSON or DASHBOARD_SA_JSON_B64 env var");
  }
  
  return new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_only"],
  });
}

async function getAccessToken(): Promise<string> {
  const auth = buildAuth();
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Failed to get GCS access token");
  return token;
}

function bucketName(slug: string): string {
  return `makini-sf-files-${slug}`;
}

/**
 * List all dated run prefixes (YYYY-MM-DD) from a GCS bucket, newest first.
 */
export async function listGCSRunDates(slug: string): Promise<string[]> {
  const token = await getAccessToken();
  const bucket = bucketName(slug);
  const dates: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
    url.searchParams.set("delimiter", "/");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return []; // bucket not found yet
    if (!res.ok) throw new Error(`GCS list failed: ${res.status}`);

    const body = await res.json() as { prefixes?: string[]; nextPageToken?: string };

    for (const prefix of body.prefixes ?? []) {
      const date = prefix.replace(/\/$/, "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
    }

    pageToken = body.nextPageToken;
  } while (pageToken);

  return dates.sort((a, b) => (a > b ? -1 : 1));
}

/**
 * Fetch manifest.json from GCS for a specific run date.
 * Returns null if not found or not yet written.
 */
export async function fetchGCSManifest(
  slug: string,
  date: string
): Promise<Manifest | null> {
  const token = await getAccessToken();
  const bucket = bucketName(slug);
  const object = encodeURIComponent(`${date}/manifest.json`);

  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;

  try {
    return (await res.json()) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Build a BackupRun for a GCS-backed client date.
 */
export async function buildGCSBackupRun(
  slug: string,
  date: string
): Promise<BackupRun> {
  const manifest = await fetchGCSManifest(slug, date);
  const bucket = bucketName(slug);
  return {
    date,
    folder_id: `gs://${bucket}/${date}`,
    folder_url: `https://console.cloud.google.com/storage/browser/${bucket}/${date}`,
    manifest,
  };
}
