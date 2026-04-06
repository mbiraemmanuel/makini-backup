/**
 * Google Drive API v3 helpers used by the dashboard API routes.
 * Authenticates via the DASHBOARD_SA_JSON_B64 service account.
 */
import { google } from "googleapis";
import type { Manifest, BackupRun } from "./types";

function getDriveService() {
  const b64 = process.env.DASHBOARD_SA_JSON_B64;
  if (!b64) throw new Error("DASHBOARD_SA_JSON_B64 env var not set");

  const saJson = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials: saJson,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/**
 * List all dated backup folders (YYYY-MM-DD) under a root folder.
 */
export async function listBackupFolders(
  rootFolderId: string
): Promise<{ id: string; name: string; createdTime: string }[]> {
  const drive = getDriveService();
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name, createdTime)",
    orderBy: "name desc",
    pageSize: 365,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = res.data.files ?? [];
  // Keep only YYYY-MM-DD named folders
  return files.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.name ?? "")) as {
    id: string;
    name: string;
    createdTime: string;
  }[];
}

/**
 * Fetch manifest.json from a dated backup folder.
 * Returns null if not found.
 */
export async function fetchManifest(
  dateFolderId: string
): Promise<Manifest | null> {
  const drive = getDriveService();

  // Find manifest.json inside the dated folder
  const res = await drive.files.list({
    q: `'${dateFolderId}' in parents and name = 'manifest.json' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files ?? [];
  if (files.length === 0) return null;

  const fileId = files[0].id!;
  const content = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "text" }
  );

  try {
    return JSON.parse(content.data as string) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Get a short-lived direct download URL for a file inside a backup folder.
 */
export async function getFileDownloadUrl(fileId: string): Promise<string> {
  // For Drive files the download URL requires auth; we proxy through the API route.
  return `/api/drive/download?fileId=${fileId}`;
}

/**
 * List CSV files inside a dated/data sub-folder.
 */
export async function listDataFiles(
  dateFolderId: string
): Promise<{ id: string; name: string; size: string }[]> {
  const drive = getDriveService();

  // Find the "data" sub-folder
  const subRes = await drive.files.list({
    q: `'${dateFolderId}' in parents and name = 'data' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const dataFolders = subRes.data.files ?? [];
  if (dataFolders.length === 0) return [];

  const dataFolderId = dataFolders[0].id!;
  const res = await drive.files.list({
    q: `'${dataFolderId}' in parents and trashed = false`,
    fields: "files(id, name, size)",
    orderBy: "name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (res.data.files ?? []) as { id: string; name: string; size: string }[];
}

/**
 * Stream a Drive file to a Node.js response (used by the download proxy route).
 */
export async function streamDriveFile(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; name: string }> {
  const drive = getDriveService();

  const meta = await drive.files.get({
    fileId,
    fields: "name, mimeType",
    supportsAllDrives: true,
  });

  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );

  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? fileId,
  };
}

/**
 * Build a BackupRun from a Drive folder entry + manifest.
 */
export async function buildBackupRun(folder: {
  id: string;
  name: string;
}): Promise<BackupRun> {
  const manifest = await fetchManifest(folder.id);
  return {
    date: folder.name,
    folder_id: folder.id,
    folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
    manifest,
  };
}
