import { NextRequest, NextResponse } from "next/server";
import { getClientConfig } from "@/lib/clients";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Jobs are stored in <repo-root>/jobs/
const JOBS_DIR = path.resolve(process.cwd(), "..", "jobs");

function ensureJobsDir() {
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
}

export type JobStatus = {
  job_id: string;
  slug: string;
  mode: string;
  status: "running" | "done" | "error";
  exit_code: number | null;
  started_at: string;
  ended_at: string | null;
};

/**
 * POST /api/clients/[slug]/trigger
 * Body (optional): { mode: "full" | "data" | "metadata" | "files" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const config = getClientConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let mode = "full";
  try {
    const body = await req.json();
    if (body?.mode) mode = body.mode;
  } catch {
    // no body — use default
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const jobId = randomUUID();
  const startedAt = new Date().toISOString();

  ensureJobsDir();

  const statusFile = path.join(JOBS_DIR, `${jobId}.json`);
  const logFile = path.join(JOBS_DIR, `${jobId}.log`);

  const initialStatus: JobStatus = {
    job_id: jobId,
    slug,
    mode,
    status: "running",
    exit_code: null,
    started_at: startedAt,
    ended_at: null,
  };
  fs.writeFileSync(statusFile, JSON.stringify(initialStatus, null, 2));
  fs.writeFileSync(logFile, `[${startedAt}] Starting ${mode} backup for ${slug}\n`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLIENT_SLUG: config.client_slug,
    BACKUP_MODE: mode,
    GCP_PROJECT_ID: config.gcp.project_id,
    GCP_REGION: config.gcp.region,
    SF_USERNAME: config.sf_username,
    SF_API_VERSION: config.sf_api_version,
    SF_ENVIRONMENT: config.sf_environment,
    PYTHONPATH: repoRoot,
    PYTHONUNBUFFERED: "1",
  };

  // Resolve Python: prefer platform-appropriate venv, then python3, then python
  const isWindows = process.platform === "win32";
  const venvPython = isWindows
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python");
  const systemPython = isWindows ? "python" : "python3";
  const pythonExe = fs.existsSync(venvPython) ? venvPython : systemPython;

  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const child = spawn(pythonExe, ["-m", "src.main"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on("error", (err) => {
    logStream.write(`[${new Date().toISOString()}] ERROR: Failed to start backup process: ${err.message}\n`);
    logStream.end();
    const final: JobStatus = {
      ...initialStatus,
      status: "error",
      exit_code: -1,
      ended_at: new Date().toISOString(),
    };
    fs.writeFileSync(statusFile, JSON.stringify(final, null, 2));
  });

  child.on("close", (code) => {
    logStream.end();
    const final: JobStatus = {
      ...initialStatus,
      status: code === 0 ? "done" : "error",
      exit_code: code,
      ended_at: new Date().toISOString(),
    };
    fs.writeFileSync(statusFile, JSON.stringify(final, null, 2));
  });

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    slug,
    mode,
    started_at: startedAt,
  });
}
