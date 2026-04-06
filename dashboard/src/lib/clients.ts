/**
 * Reads client config JSON files from the clients/ directory
 * (one level above the dashboard/ folder in the repo).
 */
import fs from "fs";
import path from "path";
import type { ClientConfig, ClientSummary } from "./types";
import { listBackupFolders, buildBackupRun } from "./drive";

const CLIENTS_DIR = path.resolve(
  process.env.CLIENTS_DIR ?? path.join(process.cwd(), "..", "clients")
);

export function getAllClientConfigs(): ClientConfig[] {
  if (!fs.existsSync(CLIENTS_DIR)) return [];
  const files = fs
    .readdirSync(CLIENTS_DIR)
    .filter((f) => f.endsWith("-config.json"));

  return files
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(CLIENTS_DIR, file), "utf-8");
        return JSON.parse(raw) as ClientConfig;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ClientConfig[];
}

export function getClientConfigPath(slug: string): string | null {
  const filePath = path.join(CLIENTS_DIR, `${slug}-config.json`);
  return fs.existsSync(filePath) ? filePath : null;
}

export function getClientConfig(slug: string): ClientConfig | null {
  const filePath = path.join(CLIENTS_DIR, `${slug}-config.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ClientConfig;
  } catch {
    return null;
  }
}

/**
 * Build a lightweight summary for the ops dashboard home page.
 * Fetches only the most recent run per client.
 */
export async function getClientSummary(
  config: ClientConfig
): Promise<ClientSummary> {
  const folders = await listBackupFolders(config.drive.root_folder_id);
  const total = folders.length;

  let lastRun = null;
  if (folders.length > 0) {
    // folders are sorted name desc (most recent first)
    lastRun = await buildBackupRun(folders[0]);
  }

  return {
    slug: config.client_slug,
    name: config.client_name,
    sf_environment: config.sf_environment,
    last_run: lastRun,
    total_runs: total,
    drive_root_folder_id: config.drive.root_folder_id,
    retention_days: config.retention_days,
  };
}
