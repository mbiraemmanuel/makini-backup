// ============================================================
// Shared TypeScript types for the SF Backup Dashboard
// ============================================================

export type RunStatus = "success" | "partial" | "error" | "running" | "skipped";

export interface ObjectResult {
  name: string;
  record_count: number;
  file_size_bytes: number;
  status: RunStatus;
  error_message: string | null;
}

export interface MetadataResult {
  types_retrieved: number;
  zip_size_bytes: number;
  status: RunStatus;
}

export interface FilesResult {
  count: number;
  total_size_bytes: number;
  status: RunStatus;
}

export interface Manifest {
  run_id: string;
  client: string;
  run_type: "data" | "metadata" | "files" | "full";
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  sf_api_version: string;
  sf_instance_url: string;
  objects: ObjectResult[];
  metadata: MetadataResult;
  files: FilesResult;
  errors: string[];
  drive_folder_id: string;
  drive_folder_url: string;
}

export interface BackupRun {
  date: string;           // YYYY-MM-DD
  folder_id: string;
  folder_url: string;
  manifest: Manifest | null;
}

export interface ClientConfig {
  client_slug: string;
  client_name: string;
  sf_username: string;
  sf_api_version: string;
  sf_environment: "production" | "sandbox";
  backup: {
    data: { enabled: boolean; schedule_cron: string; schedule_timezone: string; incremental: boolean };
    metadata: { enabled: boolean; schedule_cron: string; schedule_timezone: string };
    files: { enabled: boolean; schedule_cron: string; storage_backend: string };
  };
  retention_days: number;
  drive: { root_folder_id: string; storage_backend: string };
  notifications: { alert_emails: string[]; notify_on: string[] };
  gcp: { project_id: string; region: string; cloud_run_job: string };
}

export interface ClientSummary {
  slug: string;
  name: string;
  sf_environment: string;
  last_run: BackupRun | null;
  total_runs: number;
  drive_root_folder_id: string;
  retention_days: number;
}

export interface RestoreRequest {
  source_date: string;        // YYYY-MM-DD — which backup to restore from
  objects: string[];          // object API names to restore (empty = all)
  target_sf_username?: string; // defaults to the integration user
  dry_run: boolean;
}

export interface RestoreJob {
  job_id: string;
  client: string;
  source_date: string;
  objects: string[];
  dry_run: boolean;
  submitted_at: string;
  cloud_run_execution_id: string | null;
}
