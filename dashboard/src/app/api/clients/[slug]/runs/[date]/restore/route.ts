/**
 * POST /api/clients/[slug]/runs/[date]/restore
 *
 * Triggers a restore Cloud Run job for the specified backup date.
 *
 * Body (JSON):
 *   {
 *     objects: string[]    // object API names; empty = restore all
 *     dry_run: boolean     // if true, validates only, no writes to SF
 *   }
 *
 * The restore job reads from Drive (the backup for [date]) and
 * upserts records back into Salesforce via the Bulk API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientConfig } from "@/lib/clients";
import { triggerCloudRunJob } from "@/lib/gcp";
import type { RestoreRequest, RestoreJob } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; date: string } }
) {
  const { slug, date } = params;

  const config = getClientConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let body: RestoreRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { objects = [], dry_run = false } = body;
  const { region, project_id } = config.gcp;
  const jobName = `sf-restore-${slug}`;

  // Environment variable overrides passed to the Cloud Run restore job
  const envOverrides: Record<string, string> = {
    CLIENT_SLUG: slug,
    RESTORE_DATE: date,
    RESTORE_OBJECTS: objects.join(","),
    DRY_RUN: dry_run ? "true" : "false",
    BACKUP_MODE: "restore",
    GCP_PROJECT_ID: project_id,
  };

  try {
    const executionId = await triggerCloudRunJob(
      jobName,
      region,
      project_id,
      envOverrides
    );

    const job: RestoreJob = {
      job_id: executionId,
      client: slug,
      source_date: date,
      objects,
      dry_run,
      submitted_at: new Date().toISOString(),
      cloud_run_execution_id: executionId,
    };

    return NextResponse.json(job, { status: 202 });
  } catch (err) {
    console.error(`[POST /api/clients/${slug}/runs/${date}/restore]`, err);
    return NextResponse.json(
      { error: `Failed to trigger restore: ${String(err)}` },
      { status: 500 }
    );
  }
}
