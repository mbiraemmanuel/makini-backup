/**
 * GCP utilities: Secret Manager reads and Cloud Run job execution triggers.
 */
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

function getProjectId(): string {
  const id = process.env.GCP_PROJECT_ID;
  if (!id) throw new Error("GCP_PROJECT_ID env var not set");
  return id;
}

function getSmClient(): SecretManagerServiceClient {
  const b64 = process.env.DASHBOARD_SA_JSON_B64;
  if (!b64) throw new Error("DASHBOARD_SA_JSON_B64 env var not set");
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  return new SecretManagerServiceClient({ credentials });
}

/**
 * Trigger a Cloud Run job execution via the Cloud Run API.
 * Used to kick off restore jobs from the dashboard.
 */
export async function triggerCloudRunJob(
  jobName: string,
  region: string,
  projectId: string,
  overrideEnv: Record<string, string> = {}
): Promise<string> {
  const { google } = await import("googleapis");
  const b64 = process.env.DASHBOARD_SA_JSON_B64!;
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const token = await auth.getAccessToken();

  const url = `https://${region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${projectId}/jobs/${jobName}:run`;

  const body: Record<string, unknown> = {};
  if (Object.keys(overrideEnv).length > 0) {
    body.overrides = {
      containerOverrides: [
        {
          env: Object.entries(overrideEnv).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloud Run trigger failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { metadata?: { name?: string } };
  return data.metadata?.name ?? "unknown-execution";
}

/**
 * List recent Cloud Run job executions for a given job.
 */
export async function listJobExecutions(
  jobName: string,
  region: string,
  projectId: string,
  limit = 20
): Promise<
  { name: string; status: string; startTime: string; completionTime?: string }[]
> {
  const { google } = await import("googleapis");
  const b64 = process.env.DASHBOARD_SA_JSON_B64!;
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await auth.getAccessToken();

  const url =
    `https://${region}-run.googleapis.com/apis/run.googleapis.com/v1/` +
    `namespaces/${projectId}/executions?` +
    `labelSelector=run.googleapis.com/job=${jobName}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as {
    items?: {
      metadata: { name: string };
      status: { conditions?: { type: string; status: string }[] };
      spec: { startTime?: string; completionTime?: string };
    }[];
  };

  return (data.items ?? []).map((item) => {
    const succeeded = item.status.conditions?.find(
      (c) => c.type === "Completed"
    );
    return {
      name: item.metadata.name,
      status: succeeded?.status === "True" ? "succeeded" : "running",
      startTime: item.spec.startTime ?? "",
      completionTime: item.spec.completionTime,
    };
  });
}
