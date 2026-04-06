"""
src/main.py — Salesforce Full-Org Backup Entry Point
=====================================================

Reads configuration from environment variables and a client config JSON,
then orchestrates data, metadata, and file backup depending on BACKUP_MODE.

Usage (local):
    CLIENT_SLUG=acme BACKUP_MODE=full python src/main.py

Usage (Cloud Run):
    Invoked automatically by the container ENTRYPOINT.
"""
from __future__ import annotations
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from src.utils.logger import log
from src.utils.secrets import get_client_secrets
from src.utils.manifest import Manifest
from src.auth.jwt_auth import SalesforceAuth
from src.data.object_enumerator import get_exportable_objects, describe_object, get_exportable_fields
from src.data.bulk_exporter import BulkExporter
from src.data.file_downloader import download_content_versions, download_attachments
from src.data.incremental import (
    load_watermarks, save_watermarks, supports_incremental, build_soql
)
from src.metadata.package_builder import build_package_xml
from src.metadata.metadata_retriever import retrieve_metadata, zip_metadata
from src.storage.drive_client import DriveClient
from src.storage.retention_manager import cleanup_old_backups
from src.notifications.notifier import send_run_summary, send_alert

# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _load_client_config(client_slug: str) -> dict:
    config_path = Path("clients") / f"{client_slug}-config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Client config not found: {config_path}")
    with open(config_path) as f:
        return json.load(f)


def _env(key: str, default: str | None = None) -> str:
    val = os.environ.get(key, default)
    if val is None:
        raise EnvironmentError(f"Required environment variable not set: {key}")
    return val


# ---------------------------------------------------------------------------
# Phase: Data backup
# ---------------------------------------------------------------------------

def run_data_backup(
    auth: SalesforceAuth,
    config: dict,
    work_dir: Path,
    manifest: Manifest,
    incremental: bool,
    drive: DriveClient | None = None,
    drive_folders: dict | None = None,
    gcs=None,
    gcs_prefix: str | None = None,
) -> None:
    log.info("=== Starting DATA backup ===")
    bulk = BulkExporter(auth)
    data_dir = work_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    extra_exclusions = config.get("backup", {}).get("data", {}).get("object_exclusions", [])
    inclusions_only = config.get("backup", {}).get("data", {}).get("object_inclusions", [])

    objects = get_exportable_objects(auth, extra_exclusions, inclusions_only or None)
    watermarks = load_watermarks() if incremental else {}
    new_watermarks = dict(watermarks)

    for obj in objects:
        name = obj["name"]
        log.info(f"Exporting {name}...")
        try:
            describe = describe_object(auth, name)
            fields = get_exportable_fields(describe)
            if not fields:
                log.warning(f"No exportable fields for {name}, skipping")
                manifest.add_object(name, status="skipped")
                continue

            since = None
            if incremental and supports_incremental(name, describe):
                since = watermarks.get(name)

            soql = build_soql(name, fields, since_timestamp=since)
            output_path = data_dir / f"{name}.csv"
            result = bulk.export_object(soql, output_path)

            # Upload to storage backend
            if gcs:
                gcs.upload_file(output_path, f"{gcs_prefix}/data")
            else:
                drive.upload_file(output_path, drive_folders["data"])

            manifest.add_object(
                name,
                record_count=result["record_count"],
                file_size_bytes=result["file_size_bytes"],
                status="success",
            )
            # Update watermark to now
            new_watermarks[name] = datetime.now(timezone.utc).isoformat()

        except Exception as exc:
            manifest.add_object(name, status="error", error_message=str(exc))
            log.error(f"Failed to export {name}: {exc}")

    save_watermarks(new_watermarks)

    # Alert if > 10% failure
    total = len(objects)
    errors = sum(1 for o in manifest.objects if o["status"] == "error")
    if total > 0 and errors / total > 0.10:
        log.warning(f"High failure rate: {errors}/{total} objects failed")

    log.info(f"Data backup complete. {total - errors}/{total} objects succeeded")


# ---------------------------------------------------------------------------
# Phase: Metadata backup
# ---------------------------------------------------------------------------

def run_metadata_backup(
    auth: SalesforceAuth,
    config: dict,
    work_dir: Path,
    manifest: Manifest,
    date_str: str,
    drive: DriveClient | None = None,
    drive_folders: dict | None = None,
    gcs=None,
    gcs_prefix: str | None = None,
) -> None:
    log.info("=== Starting METADATA backup ===")
    type_exclusions = config.get("backup", {}).get("metadata", {}).get("metadata_type_exclusions", [])
    meta_dir = work_dir / "metadata_retrieve"
    package_path = work_dir / "package.xml"

    try:
        build_package_xml(auth, package_path, type_exclusions)
        retrieve_metadata(
            sf_username=config["sf_username"],
            package_xml_path=package_path,
            retrieve_dir=meta_dir,
        )
        zip_path = zip_metadata(meta_dir, date_str)

        zip_size = zip_path.stat().st_size
        manifest.metadata["zip_size_bytes"] = zip_size
        manifest.metadata["status"] = "success"

        if gcs:
            gcs.upload_file(zip_path, f"{gcs_prefix}/metadata")
            gcs.upload_file(package_path, f"{gcs_prefix}/metadata")
        else:
            drive.upload_file(zip_path, drive_folders["metadata"])
            # Also upload the package.xml for reference
            drive.upload_file(package_path, drive_folders["metadata"])

        log.info("Metadata backup complete")
    except Exception as exc:
        manifest.metadata["status"] = "error"
        manifest.add_error(f"Metadata backup failed: {exc}")
        log.error(f"Metadata backup error: {exc}")


# ---------------------------------------------------------------------------
# Phase: File backup
# ---------------------------------------------------------------------------

def run_file_backup(
    auth: SalesforceAuth,
    config: dict,
    work_dir: Path,
    manifest: Manifest,
    drive: DriveClient | None = None,
    drive_folders: dict | None = None,
    gcs=None,
    gcs_prefix: str | None = None,
) -> None:
    log.info("=== Starting FILE backup ===")
    try:
        cv_index, cv_errors = download_content_versions(auth, work_dir)
        att_index, att_errors = download_attachments(auth, work_dir)

        files_dir = work_dir / "files"
        total_size = sum(f.stat().st_size for f in files_dir.rglob("*") if f.is_file())

        if gcs:
            log.info(f"Uploading files to GCS (total size: {total_size:,} bytes)")
            for f in files_dir.rglob("*"):
                if f.is_file():
                    gcs.upload_file(f, f"{gcs_prefix}/files")
            for index_file in [work_dir / "content_version_index.csv", work_dir / "attachment_index.csv"]:
                if index_file.exists():
                    gcs.upload_file(index_file, f"{gcs_prefix}/files")
        else:
            for f in files_dir.rglob("*"):
                if f.is_file():
                    drive.upload_file(f, drive_folders["files"])
            for index_file in [work_dir / "content_version_index.csv", work_dir / "attachment_index.csv"]:
                if index_file.exists():
                    drive.upload_file(index_file, drive_folders["files"])

        all_errors = cv_errors + att_errors
        manifest.files = {
            "count": len(cv_index) + len(att_index),
            "total_size_bytes": total_size,
            "status": "partial" if all_errors else "success",
        }
        for err in all_errors:
            manifest.add_error(err)

        log.info("File backup complete")
    except Exception as exc:
        manifest.files["status"] = "error"
        manifest.add_error(f"File backup failed: {exc}")
        log.error(f"File backup error: {exc}")


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def main() -> None:
    client_slug = _env("CLIENT_SLUG")
    backup_mode = _env("BACKUP_MODE", "full")
    sf_api_version = _env("SF_API_VERSION", "59.0")
    retention_days = int(_env("RETENTION_DAYS", "90"))
    notification_emails = [e.strip() for e in _env("NOTIFICATION_EMAILS", "").split(",") if e.strip()]

    log.info(f"Starting backup | client={client_slug} mode={backup_mode}")

    # ---- Load config ----
    config = _load_client_config(client_slug)
    sf_env = config.get("sf_environment", "production")
    incremental = config.get("backup", {}).get("data", {}).get("incremental", True)

    # ---- Fetch secrets ----
    log.info("Fetching secrets from GCP Secret Manager...")
    secrets = get_client_secrets(client_slug)

    # ---- Authenticate ----
    auth = SalesforceAuth(
        consumer_key=secrets["consumer_key"],
        username=secrets["username"],
        private_key_pem=secrets["private_key"],
        environment=sf_env,
        api_version=sf_api_version,
    )
    try:
        auth.authenticate()
    except Exception as exc:
        log.critical(f"Authentication failed: {exc}")
        send_alert(
            secrets["sendgrid_api_key"],
            notification_emails,
            client_slug,
            "AUTH FAILURE",
            f"JWT authentication failed and the backup was aborted.<br><pre>{exc}</pre>",
        )
        sys.exit(1)

    # ---- Set up storage backend ----
    drive_config = config.get("drive", {})
    storage_backend = drive_config.get("storage_backend", "drive")
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    drive: DriveClient | None = None
    drive_folders: dict = {}
    gcs = None
    gcs_prefix: str | None = None

    if storage_backend == "gcs":
        from src.storage.gcs_client import GCSClient
        gcs = GCSClient(secrets["sa_json"], client_slug, _env("GCP_PROJECT_ID"))
        gcs.ensure_bucket()
        gcs_prefix = date_str
        log.info(f"Storage backend: GCS — gs://{gcs._bucket_name}/{gcs_prefix}/")
    else:
        drive = DriveClient(secrets["sa_json"], drive_config["root_folder_id"])
        drive_folders = drive.create_run_folder_structure(date_str)
        log.info(f"Storage backend: Drive — {drive.folder_url(drive_folders['root'])}")

    # ---- Manifest ----
    manifest = Manifest(
        client=client_slug,
        run_type=backup_mode,
        sf_api_version=sf_api_version,
        sf_instance_url=auth.instance_url,
    )
    if drive_folders:
        manifest.drive_folder_id = drive_folders.get("root")
        manifest.drive_folder_url = drive.folder_url(drive_folders["root"]) if drive else None

    # ---- Work directory ----
    with tempfile.TemporaryDirectory(prefix="sf_backup_") as tmp:
        work_dir = Path(tmp)
        log.info(f"Working directory: {work_dir}")

        try:
            if backup_mode in ("data", "full"):
                run_data_backup(auth, config, work_dir, manifest, incremental,
                                drive=drive, drive_folders=drive_folders, gcs=gcs, gcs_prefix=gcs_prefix)

            if backup_mode in ("metadata", "full"):
                run_metadata_backup(auth, config, work_dir, manifest, date_str,
                                    drive=drive, drive_folders=drive_folders, gcs=gcs, gcs_prefix=gcs_prefix)

            if backup_mode in ("files", "full"):
                run_file_backup(auth, config, work_dir, manifest,
                                drive=drive, drive_folders=drive_folders, gcs=gcs, gcs_prefix=gcs_prefix)

        except Exception as exc:
            manifest.add_error(f"Unexpected abort: {exc}")
            log.critical(f"Run aborted: {exc}", exc_info=True)
            send_alert(
                secrets["sendgrid_api_key"],
                notification_emails,
                client_slug,
                "RUN ABORTED",
                f"The backup run was aborted unexpectedly.<br><pre>{exc}</pre>",
            )
            raise

        finally:
            # ---- Finalize manifest ----
            manifest.complete()
            import json as _json
            manifest_path = work_dir / "manifest.json"
            manifest.save(manifest_path)
            if gcs:
                gcs.upload_file(manifest_path, gcs_prefix)
            else:
                drive.upload_string(
                    _json.dumps(manifest.to_dict(), indent=2),
                    drive_folders["root"],
                    "manifest.json",
                )

            # ---- Retention cleanup ----
            if drive:
                try:
                    deleted = cleanup_old_backups(drive, retention_days)
                    log.info(f"Cleaned up {len(deleted)} old backup folder(s)")
                except Exception as exc:
                    log.warning(f"Retention cleanup failed: {exc}")

            # ---- Send summary notification ----
            try:
                send_run_summary(secrets["sendgrid_api_key"], notification_emails, manifest)
            except Exception as exc:
                log.warning(f"Could not send summary notification: {exc}")

    log.info(
        f"Backup complete | run_id={manifest.run_id} "
        f"status={manifest.overall_status()} "
        f"duration={manifest.duration_seconds}s"
    )


if __name__ == "__main__":
    main()
