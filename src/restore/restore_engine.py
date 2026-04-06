"""
restore_engine.py — Salesforce Backup Restore Engine
=====================================================
Reads backup CSVs from Google Drive and upserts them back into a Salesforce org
using the Bulk API 2.0.

Environment variables (set by the Cloud Run job trigger from the dashboard):
    CLIENT_SLUG          – slug matching a JSON file in clients/
    RESTORE_DATE         – folder name in Drive, e.g. "2025-06-15"
    RESTORE_OBJECTS      – comma-separated sObject names, or "" for all
    DRY_RUN              – "true" to validate without writing (default "false")
    BACKUP_MODE          – must be "restore" to activate this module
    GCP_PROJECT_ID       – GCP project for Secret Manager

Outputs:
    • Restore manifest JSON written to Drive under the source run's folder
    • Email notification via SendGrid
    • Structured console logs (loguru)
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

import requests
from googleapiclient.discovery import build  # type: ignore
from google.oauth2 import service_account  # type: ignore
from loguru import logger

# ── Sibling imports ──────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from auth.jwt_auth import SalesforceAuth          # noqa: E402
from notifications.notifier import send_alert     # noqa: E402
from utils.retry import api_retry                 # noqa: E402
from utils.secrets import get_client_secrets      # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────────
BULK_API_BASE = "/services/data/v59.0/jobs/ingest"
POLL_INTERVAL = 10          # seconds between job status polls
CHUNK_SIZE = 10_000         # rows per Bulk API 2.0 batch
UPLOAD_THRESHOLD = 5 * 1024 * 1024   # 5 MB — resumable vs simple upload


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ObjectRestoreResult:
    object_name: str
    status: str = "pending"          # pending | success | error | skipped | dry_run_ok
    records_processed: int = 0
    records_failed: int = 0
    error: str | None = None
    dry_run_issues: list[str] = field(default_factory=list)


@dataclass
class RestoreManifest:
    client_slug: str
    restore_date: str
    started_at: str
    completed_at: str | None = None
    duration_seconds: int | None = None
    dry_run: bool = False
    overall_status: str = "running"   # running | success | partial | error
    objects: list[ObjectRestoreResult] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


# ─────────────────────────────────────────────────────────────────────────────
# Google Drive helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_drive_service(sa_json: str):
    creds = service_account.Credentials.from_service_account_info(
        json.loads(sa_json),
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _find_folder(drive, parent_id: str, name: str) -> str | None:
    resp = (
        drive.files()
        .list(
            q=(
                f"'{parent_id}' in parents"
                f" AND name='{name}'"
                f" AND mimeType='application/vnd.google-apps.folder'"
                f" AND trashed=false"
            ),
            fields="files(id)",
            pageSize=1,
        )
        .execute()
    )
    files = resp.get("files", [])
    return files[0]["id"] if files else None


def _list_csv_files(drive, folder_id: str) -> list[dict]:
    """Return all CSV metadata records in the given folder."""
    results: list[dict] = []
    page_token: str | None = None
    while True:
        resp = (
            drive.files()
            .list(
                q=(
                    f"'{folder_id}' in parents"
                    f" AND name contains '.csv'"
                    f" AND trashed=false"
                ),
                fields="nextPageToken, files(id, name, size)",
                pageSize=200,
                pageToken=page_token,
            )
            .execute()
        )
        results.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return results


def _download_csv(drive, file_id: str) -> str:
    """Download a Drive file and return its text content."""
    request = drive.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    from googleapiclient.http import MediaIoBaseDownload  # type: ignore
    downloader = MediaIoBaseDownload(buf, request, chunksize=10 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue().decode("utf-8")


def _upload_json(drive, parent_id: str, file_name: str, content: str) -> str:
    """Upload a small JSON string to Drive, return file ID."""
    from googleapiclient.http import MediaIoBaseUpload  # type: ignore

    media = MediaIoBaseUpload(
        io.BytesIO(content.encode()),
        mimetype="application/json",
        resumable=False,
    )
    meta = {"name": file_name, "parents": [parent_id]}
    file = drive.files().create(body=meta, media_body=media, fields="id").execute()
    return file["id"]


# ─────────────────────────────────────────────────────────────────────────────
# Dry-run validation
# ─────────────────────────────────────────────────────────────────────────────

@api_retry
def _describe_object(auth: SalesforceAuth, object_name: str) -> dict:
    url = f"{auth.base_url()}/services/data/v59.0/sobjects/{object_name}/describe"
    r = requests.get(url, headers=auth.session_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def _validate_csv(auth: SalesforceAuth, object_name: str, csv_text: str) -> list[str]:
    """Compare CSV columns against org field API names. Returns list of issues."""
    issues: list[str] = []
    reader = csv.DictReader(io.StringIO(csv_text))
    csv_fields = set(reader.fieldnames or [])

    if not csv_fields:
        issues.append(f"{object_name}: CSV has no columns")
        return issues

    try:
        describe = _describe_object(auth, object_name)
    except Exception as exc:
        issues.append(f"{object_name}: cannot describe object — {exc}")
        return issues

    org_fields = {f["name"] for f in describe.get("fields", [])}
    unknown = csv_fields - org_fields - {"Id"}
    if unknown:
        issues.append(
            f"{object_name}: CSV contains fields not found in org: "
            + ", ".join(sorted(unknown))
        )
    if "Id" not in csv_fields:
        issues.append(f"{object_name}: CSV is missing 'Id' column required for upsert")

    return issues


# ─────────────────────────────────────────────────────────────────────────────
# Bulk API 2.0 upsert
# ─────────────────────────────────────────────────────────────────────────────

def _iter_chunks(csv_text: str, chunk_size: int) -> Generator[str, None, None]:
    """Yield sub-CSVs with the header row repeated for each chunk."""
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    header = ",".join(fieldnames)
    rows = list(reader)
    for i in range(0, len(rows), chunk_size):
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows[i : i + chunk_size])
        yield buf.getvalue()


@api_retry
def _create_bulk_job(auth: SalesforceAuth, object_name: str) -> str:
    url = f"{auth.base_url()}{BULK_API_BASE}"
    payload = {
        "operation": "upsert",
        "object": object_name,
        "externalIdFieldName": "Id",
        "contentType": "CSV",
        "lineEnding": "LF",
    }
    r = requests.post(url, json=payload, headers=auth.session_headers(), timeout=30)
    r.raise_for_status()
    return r.json()["id"]


@api_retry
def _upload_batch(auth: SalesforceAuth, job_id: str, csv_chunk: str) -> None:
    url = f"{auth.base_url()}{BULK_API_BASE}/{job_id}/batches"
    headers = {**auth.session_headers(), "Content-Type": "text/csv"}
    r = requests.put(url, data=csv_chunk.encode(), headers=headers, timeout=120)
    r.raise_for_status()


@api_retry
def _close_job(auth: SalesforceAuth, job_id: str) -> None:
    url = f"{auth.base_url()}{BULK_API_BASE}/{job_id}"
    r = requests.patch(
        url,
        json={"state": "UploadComplete"},
        headers=auth.session_headers(),
        timeout=30,
    )
    r.raise_for_status()


@api_retry
def _abort_job(auth: SalesforceAuth, job_id: str) -> None:
    url = f"{auth.base_url()}{BULK_API_BASE}/{job_id}"
    r = requests.patch(
        url,
        json={"state": "Aborted"},
        headers=auth.session_headers(),
        timeout=30,
    )
    r.raise_for_status()


def _poll_job(auth: SalesforceAuth, job_id: str) -> dict:
    url = f"{auth.base_url()}{BULK_API_BASE}/{job_id}"
    terminal = {"JobComplete", "Failed", "Aborted"}
    while True:
        r = requests.get(url, headers=auth.session_headers(), timeout=30)
        r.raise_for_status()
        job = r.json()
        state = job.get("state", "")
        logger.debug(f"Job {job_id} state={state}")
        if state in terminal:
            return job
        time.sleep(POLL_INTERVAL)


def _get_failed_record_results(auth: SalesforceAuth, job_id: str) -> list[dict]:
    url = f"{auth.base_url()}{BULK_API_BASE}/{job_id}/failedResults"
    r = requests.get(url, headers=auth.session_headers(), timeout=60)
    r.raise_for_status()
    reader = csv.DictReader(io.StringIO(r.text))
    return list(reader)


def restore_object(
    auth: SalesforceAuth,
    object_name: str,
    csv_text: str,
) -> ObjectRestoreResult:
    result = ObjectRestoreResult(object_name=object_name)

    reader = csv.DictReader(io.StringIO(csv_text))
    all_rows = list(reader)
    total = len(all_rows)
    logger.info(f"Restoring {object_name}: {total} records")

    if total == 0:
        result.status = "skipped"
        return result

    job_id: str | None = None
    try:
        job_id = _create_bulk_job(auth, object_name)
        logger.info(f"{object_name}: Bulk job created → {job_id}")

        for chunk in _iter_chunks(csv_text, CHUNK_SIZE):
            _upload_batch(auth, job_id, chunk)

        _close_job(auth, job_id)
        job = _poll_job(auth, job_id)

        processed = int(job.get("numberRecordsProcessed", 0))
        failed = int(job.get("numberRecordsFailed", 0))
        result.records_processed = processed
        result.records_failed = failed

        if job.get("state") == "Failed":
            result.status = "error"
            result.error = job.get("errorMessage", "Job failed")
            logger.error(f"{object_name}: job failed — {result.error}")
        elif failed > 0:
            result.status = "partial"
            failed_rows = _get_failed_record_results(auth, job_id)
            sample = failed_rows[:3]
            sample_msgs = "; ".join(r.get("sf__Error", "") for r in sample)
            result.error = f"{failed} record(s) failed. Sample: {sample_msgs}"
            logger.warning(f"{object_name}: {failed}/{processed} records failed")
        else:
            result.status = "success"
            logger.info(f"{object_name}: ✓ {processed} records upserted")

    except Exception as exc:
        result.status = "error"
        result.error = str(exc)
        logger.exception(f"{object_name}: unexpected error")
        if job_id:
            try:
                _abort_job(auth, job_id)
            except Exception:
                pass

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    client_slug = os.environ["CLIENT_SLUG"]
    restore_date = os.environ["RESTORE_DATE"]          # e.g. "2025-06-15"
    restore_objects_raw = os.environ.get("RESTORE_OBJECTS", "")
    dry_run = os.environ.get("DRY_RUN", "false").lower() in ("true", "1", "yes")
    gcp_project = os.environ["GCP_PROJECT_ID"]

    logger.info(
        f"Restore starting | client={client_slug} date={restore_date} "
        f"dry_run={dry_run}"
    )

    # ── Load secrets ──────────────────────────────────────────────────────────
    secrets = get_client_secrets(gcp_project, client_slug)
    auth = SalesforceAuth(
        consumer_key=secrets["consumer_key"],
        private_key=secrets["private_key"],
        username=secrets["username"],
        instance_url=secrets["instance_url"],
    )
    auth.authenticate()
    logger.info("Salesforce authentication successful")

    # ── Build Drive service ───────────────────────────────────────────────────
    sa_json = secrets["sa_json"]
    drive = _build_drive_service(sa_json)

    # ── Load client config to get root Drive folder ───────────────────────────
    config_path = Path(__file__).resolve().parent.parent.parent / "clients" / f"{client_slug}.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Client config not found: {config_path}")
    with config_path.open() as f:
        client_config = json.load(f)
    root_folder_id: str = client_config["drive_root_folder_id"]

    # ── Find date folder ──────────────────────────────────────────────────────
    date_folder_id = _find_folder(drive, root_folder_id, restore_date)
    if not date_folder_id:
        raise RuntimeError(f"Drive folder not found for date: {restore_date}")

    data_folder_id = _find_folder(drive, date_folder_id, "data")
    if not data_folder_id:
        raise RuntimeError(f"No 'data' sub-folder found under {restore_date}")

    # ── List available CSV files ───────────────────────────────────────────────
    csv_files = _list_csv_files(drive, data_folder_id)
    csv_by_object: dict[str, dict] = {}
    for f in csv_files:
        # filename format: "Account.csv" or "Account_part1.csv"
        base_name = f["name"].replace(".csv", "").split("_part")[0]
        csv_by_object[base_name] = f   # last part wins if multi-part (aggregate later)

    # ── Filter requested objects ───────────────────────────────────────────────
    if restore_objects_raw.strip():
        requested = [o.strip() for o in restore_objects_raw.split(",") if o.strip()]
    else:
        requested = list(csv_by_object.keys())

    logger.info(f"Objects to restore: {requested}")

    # ── Build manifest ─────────────────────────────────────────────────────────
    manifest = RestoreManifest(
        client_slug=client_slug,
        restore_date=restore_date,
        started_at=datetime.now(timezone.utc).isoformat(),
        dry_run=dry_run,
    )

    # ── Process each object ────────────────────────────────────────────────────
    for obj_name in requested:
        if obj_name not in csv_by_object:
            logger.warning(f"{obj_name}: no CSV found in Drive, skipping")
            result = ObjectRestoreResult(
                object_name=obj_name,
                status="skipped",
                error="CSV not found in Drive backup folder",
            )
            manifest.objects.append(result)
            continue

        file_meta = csv_by_object[obj_name]
        logger.info(f"Downloading {obj_name}.csv (id={file_meta['id']})")
        csv_text = _download_csv(drive, file_meta["id"])

        if dry_run:
            issues = _validate_csv(auth, obj_name, csv_text)
            if issues:
                result = ObjectRestoreResult(
                    object_name=obj_name,
                    status="dry_run_issues",
                    dry_run_issues=issues,
                )
                logger.warning(f"{obj_name}: dry-run found {len(issues)} issue(s)")
            else:
                result = ObjectRestoreResult(
                    object_name=obj_name,
                    status="dry_run_ok",
                    records_processed=sum(1 for _ in csv.DictReader(io.StringIO(csv_text))),
                )
                logger.info(f"{obj_name}: dry-run OK → {result.records_processed} records ready")
            manifest.objects.append(result)
        else:
            result = restore_object(auth, obj_name, csv_text)
            manifest.objects.append(result)

    # ── Finalize manifest ──────────────────────────────────────────────────────
    completed_at = datetime.now(timezone.utc)
    manifest.completed_at = completed_at.isoformat()
    started = datetime.fromisoformat(manifest.started_at)
    manifest.duration_seconds = int((completed_at - started).total_seconds())

    statuses = {r.status for r in manifest.objects}
    if statuses <= {"success", "skipped", "dry_run_ok"}:
        manifest.overall_status = "success"
    elif "success" in statuses or "partial" in statuses or "dry_run_ok" in statuses:
        manifest.overall_status = "partial"
    else:
        manifest.overall_status = "error"

    # ── Write manifest to Drive ────────────────────────────────────────────────
    prefix = "dry_run_" if dry_run else ""
    manifest_name = f"restore_manifest_{prefix}{completed_at.strftime('%Y%m%d_%H%M%S')}.json"
    manifest_json = json.dumps(manifest.to_dict(), indent=2)
    file_id = _upload_json(drive, date_folder_id, manifest_name, manifest_json)
    logger.info(f"Restore manifest written to Drive: {manifest_name} (id={file_id})")

    # ── Send notification ──────────────────────────────────────────────────────
    try:
        sendgrid_key = secrets.get("sendgrid_api_key", "")
        to_email = client_config.get("notification_email", "ops@makiniconsulting.com")
        if sendgrid_key:
            mode_label = "[DRY RUN] " if dry_run else ""
            body_lines = [f"<p>Restore {manifest.overall_status} for {restore_date}.</p>"]
            body_lines.append("<table><tr><th>Object</th><th>Status</th><th>Records</th><th>Errors</th></tr>")
            for r in manifest.objects:
                body_lines.append(
                    f"<tr><td>{r.object_name}</td><td>{r.status}</td>"
                    f"<td>{r.records_processed}</td>"
                    f"<td>{r.error or ''}</td></tr>"
                )
            body_lines.append("</table>")
            send_alert(
                api_key=sendgrid_key,
                to_emails=[to_email],
                client=client_config["client_name"],
                subject_suffix=(
                    f"{mode_label}Restore {manifest.overall_status.upper()} — {restore_date}"
                ),
                message="".join(body_lines),
            )
    except Exception:
        logger.exception("Failed to send restore notification email")

    # ── Exit code ──────────────────────────────────────────────────────────────
    logger.info(f"Restore complete — overall_status={manifest.overall_status}")
    return 0 if manifest.overall_status in ("success", "partial") else 1


if __name__ == "__main__":
    sys.exit(main())
