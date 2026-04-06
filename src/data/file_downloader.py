"""
ContentVersion and legacy Attachment downloader.

Streams files directly; avoids buffering entire content in memory.
Uploads directly to Google Drive using the drive_client resumable upload.

Spec (section 8):
  - Max 3 concurrent downloads
  - Max 3 retries per file
  - Log & skip on repeated failure
"""
from __future__ import annotations
import csv
import io
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from src.auth.jwt_auth import SalesforceAuth
from src.utils.retry import api_retry
from src.utils.logger import log

_MAX_WORKERS = 3
_CHUNK_SIZE = 10 * 1024 * 1024  # 10 MB


def _soql_content_versions(auth: SalesforceAuth) -> list[dict[str, Any]]:
    """Fetch metadata for all latest ContentVersions."""
    from simple_salesforce import Salesforce

    sf = Salesforce(
        instance_url=auth.instance_url,
        session_id=auth.access_token,
        version=auth.api_version,
    )
    query = (
        "SELECT Id, Title, FileExtension, ContentSize, ContentDocumentId, "
        "CreatedDate, LastModifiedDate "
        "FROM ContentVersion WHERE IsLatest = true"
    )
    result = sf.query_all(query)
    return result["records"]


def _soql_attachments(auth: SalesforceAuth) -> list[dict[str, Any]]:
    """Fetch metadata for all legacy Attachments."""
    from simple_salesforce import Salesforce

    sf = Salesforce(
        instance_url=auth.instance_url,
        session_id=auth.access_token,
        version=auth.api_version,
    )
    query = (
        "SELECT Id, Name, ContentType, BodyLength, ParentId, CreatedDate "
        "FROM Attachment"
    )
    result = sf.query_all(query)
    return result["records"]


@api_retry
def _stream_to_file(
    auth: SalesforceAuth,
    endpoint_path: str,
    dest_path: Path,
) -> int:
    """Stream a binary resource from Salesforce REST API to a local file."""
    url = f"{auth.instance_url}/services/data/v{auth.api_version}{endpoint_path}"
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    total = 0
    with requests.get(url, headers=auth.session_headers(), stream=True, timeout=600) as resp:
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=_CHUNK_SIZE):
                f.write(chunk)
                total += len(chunk)

    return total


def download_content_versions(
    auth: SalesforceAuth,
    output_dir: Path,
) -> tuple[list[dict], list[str]]:
    """
    Download all latest ContentVersions to output_dir/files/.

    Returns:
        (index_rows, errors)
    """
    records = _soql_content_versions(auth)
    log.info(f"ContentVersions to download: {len(records)}")

    index_rows: list[dict] = []
    errors: list[str] = []
    files_dir = output_dir / "files"

    def _download_one(rec: dict) -> dict | None:
        cv_id = rec["Id"]
        ext = rec.get("FileExtension") or "bin"
        title = rec.get("Title", cv_id).replace("/", "_")
        doc_id = rec.get("ContentDocumentId", cv_id)
        filename = f"{doc_id}_{title}.{ext}"
        dest = files_dir / filename
        try:
            size = _stream_to_file(
                auth,
                f"/sobjects/ContentVersion/{cv_id}/VersionData",
                dest,
            )
            return {
                "Id": cv_id,
                "ContentDocumentId": doc_id,
                "Title": rec.get("Title"),
                "FileExtension": ext,
                "ContentSize": rec.get("ContentSize"),
                "Filename": filename,
                "LocalPath": str(dest),
                "DownloadedBytes": size,
                "Status": "success",
            }
        except Exception as exc:
            msg = f"Failed to download ContentVersion {cv_id}: {exc}"
            log.error(msg)
            return {"Id": cv_id, "Status": "error", "Error": str(exc)}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = {pool.submit(_download_one, rec): rec for rec in records}
        for future in as_completed(futures):
            result = future.result()
            if result:
                if result.get("Status") == "error":
                    errors.append(result.get("Error", "unknown"))
                index_rows.append(result)

    # Write index CSV
    _write_index(index_rows, output_dir / "content_version_index.csv")
    return index_rows, errors


def download_attachments(
    auth: SalesforceAuth,
    output_dir: Path,
) -> tuple[list[dict], list[str]]:
    """
    Download all legacy Attachments to output_dir/files/.

    Returns:
        (index_rows, errors)
    """
    records = _soql_attachments(auth)
    log.info(f"Attachments to download: {len(records)}")

    index_rows: list[dict] = []
    errors: list[str] = []
    files_dir = output_dir / "files"

    def _download_one(rec: dict) -> dict | None:
        att_id = rec["Id"]
        name = rec.get("Name", att_id).replace("/", "_")
        filename = f"{att_id}_{name}"
        dest = files_dir / filename
        try:
            size = _stream_to_file(
                auth,
                f"/sobjects/Attachment/{att_id}/Body",
                dest,
            )
            return {
                "Id": att_id,
                "Name": rec.get("Name"),
                "ParentId": rec.get("ParentId"),
                "ContentType": rec.get("ContentType"),
                "BodyLength": rec.get("BodyLength"),
                "Filename": filename,
                "LocalPath": str(dest),
                "DownloadedBytes": size,
                "Status": "success",
            }
        except Exception as exc:
            msg = f"Failed to download Attachment {att_id}: {exc}"
            log.error(msg)
            return {"Id": att_id, "Status": "error", "Error": str(exc)}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = {pool.submit(_download_one, rec): rec for rec in records}
        for future in as_completed(futures):
            result = future.result()
            if result:
                if result.get("Status") == "error":
                    errors.append(result.get("Error", "unknown"))
                index_rows.append(result)

    _write_index(index_rows, output_dir / "attachment_index.csv")
    return index_rows, errors


def _write_index(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    log.info(f"Index written: {path}")
