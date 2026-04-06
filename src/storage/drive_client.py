"""
Google Drive API wrapper (v3).

Handles:
  - Folder creation (idempotent)
  - Simple upload  (< 5 MB)
  - Resumable upload (>= 5 MB) with 10 MB chunks
  - File listing for retention cleanup
"""
from __future__ import annotations
import io
import json
from pathlib import Path
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload

from src.utils.retry import api_retry
from src.utils.logger import log

_SCOPES = ["https://www.googleapis.com/auth/drive"]
_SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024   # 5 MB
_RESUMABLE_CHUNK_SIZE = 10 * 1024 * 1024      # 10 MB

_MIME = {
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".json": "application/json",
}


def _build_service(sa_json_str: str):
    """Build an authenticated Drive service from a service account JSON string."""
    info = json.loads(sa_json_str)
    creds = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


class DriveClient:
    def __init__(self, sa_json_str: str, root_folder_id: str):
        """
        Args:
            sa_json_str: GCP service account JSON as a string.
            root_folder_id: Google Drive folder ID of /SF Backups/.
        """
        self._service = _build_service(sa_json_str)
        self.root_folder_id = root_folder_id

    # ------------------------------------------------------------------
    # Folder management
    # ------------------------------------------------------------------

    @api_retry
    def get_or_create_folder(self, name: str, parent_id: str) -> str:
        """
        Return folder ID, creating it if it doesn't exist.
        """
        query = (
            f"name = '{name}' "
            f"and mimeType = 'application/vnd.google-apps.folder' "
            f"and '{parent_id}' in parents "
            f"and trashed = false"
        )
        result = (
            self._service.files()
            .list(q=query, fields="files(id, name)", supportsAllDrives=True)
            .execute()
        )
        files = result.get("files", [])
        if files:
            folder_id = files[0]["id"]
            log.debug(f"Folder '{name}' already exists: {folder_id}")
            return folder_id

        metadata = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = (
            self._service.files()
            .create(body=metadata, fields="id", supportsAllDrives=True)
            .execute()
        )
        folder_id = folder["id"]
        log.info(f"Created folder '{name}': {folder_id}")
        return folder_id

    def create_run_folder_structure(self, date_str: str) -> dict[str, str]:
        """
        Create /SF Backups/YYYY-MM-DD/ and its sub-folders.

        Returns:
            dict with keys: root, data, metadata, files
        """
        run_folder = self.get_or_create_folder(date_str, self.root_folder_id)
        data_folder = self.get_or_create_folder("data", run_folder)
        meta_folder = self.get_or_create_folder("metadata", run_folder)
        files_folder = self.get_or_create_folder("files", run_folder)
        return {
            "root": run_folder,
            "data": data_folder,
            "metadata": meta_folder,
            "files": files_folder,
        }

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------

    @api_retry
    def upload_file(
        self,
        local_path: Path,
        folder_id: str,
        file_name: str | None = None,
    ) -> dict[str, str]:
        """
        Upload a local file to a Drive folder.

        Chooses simple vs resumable upload based on file size.

        Returns:
            dict with keys: id, webViewLink
        """
        name = file_name or local_path.name
        mime = _MIME.get(local_path.suffix.lower(), "application/octet-stream")
        size = local_path.stat().st_size

        metadata: dict[str, Any] = {"name": name, "parents": [folder_id]}

        if size < _SIMPLE_UPLOAD_THRESHOLD:
            log.debug(f"Simple upload: {name} ({size:,} bytes)")
            media = MediaFileUpload(str(local_path), mimetype=mime, resumable=False)
        else:
            log.debug(f"Resumable upload: {name} ({size:,} bytes)")
            media = MediaFileUpload(
                str(local_path),
                mimetype=mime,
                chunksize=_RESUMABLE_CHUNK_SIZE,
                resumable=True,
            )

        file = (
            self._service.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id, webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )
        log.info(f"Uploaded '{name}' → {file.get('webViewLink')}")
        return file

    @api_retry
    def upload_string(
        self,
        content: str,
        folder_id: str,
        file_name: str,
        mime: str = "application/json",
    ) -> dict[str, str]:
        """Upload an in-memory string as a file to Drive."""
        metadata: dict[str, Any] = {"name": file_name, "parents": [folder_id]}
        media = MediaIoBaseUpload(
            io.BytesIO(content.encode("utf-8")),
            mimetype=mime,
            resumable=False,
        )
        file = (
            self._service.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id, webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )
        log.info(f"Uploaded string as '{file_name}'")
        return file

    # ------------------------------------------------------------------
    # Listing (for retention)
    # ------------------------------------------------------------------

    @api_retry
    def list_folders(self, parent_id: str) -> list[dict[str, str]]:
        """List direct child folders of parent_id."""
        query = (
            f"mimeType = 'application/vnd.google-apps.folder' "
            f"and '{parent_id}' in parents "
            f"and trashed = false"
        )
        result = (
            self._service.files()
            .list(q=query, fields="files(id, name, createdTime)", supportsAllDrives=True)
            .execute()
        )
        return result.get("files", [])

    @api_retry
    def delete_file(self, file_id: str) -> None:
        """Permanently delete a file or folder."""
        self._service.files().delete(
            fileId=file_id, supportsAllDrives=True
        ).execute()
        log.info(f"Deleted Drive item: {file_id}")

    def folder_url(self, folder_id: str) -> str:
        return f"https://drive.google.com/drive/folders/{folder_id}"
