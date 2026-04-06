"""
manifest.json builder — tracks every run's metadata, object results,
and final Drive location.
"""
from __future__ import annotations
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.utils.logger import log


class Manifest:
    def __init__(self, client: str, run_type: str, sf_api_version: str, sf_instance_url: str):
        self.run_id: str = str(uuid.uuid4())
        self.client: str = client
        self.run_type: str = run_type
        self.sf_api_version: str = sf_api_version
        self.sf_instance_url: str = sf_instance_url
        self.started_at: str = datetime.now(timezone.utc).isoformat()
        self.completed_at: str | None = None
        self.duration_seconds: float = 0.0
        self.objects: list[dict[str, Any]] = []
        self.metadata: dict[str, Any] = {
            "types_retrieved": 0,
            "zip_size_bytes": 0,
            "status": "skipped",
        }
        self.files: dict[str, Any] = {
            "count": 0,
            "total_size_bytes": 0,
            "status": "skipped",
        }
        self.errors: list[str] = []
        self.drive_folder_id: str | None = None
        self.drive_folder_url: str | None = None

    # ------------------------------------------------------------------
    # Object tracking
    # ------------------------------------------------------------------

    def add_object(
        self,
        name: str,
        record_count: int = 0,
        file_size_bytes: int = 0,
        status: str = "success",
        error_message: str | None = None,
    ) -> None:
        self.objects.append(
            {
                "name": name,
                "record_count": record_count,
                "file_size_bytes": file_size_bytes,
                "status": status,
                "error_message": error_message,
            }
        )

    def add_error(self, message: str) -> None:
        log.error(message)
        self.errors.append(message)

    # ------------------------------------------------------------------
    # Finalise & serialise
    # ------------------------------------------------------------------

    def complete(self) -> None:
        self.completed_at = datetime.now(timezone.utc).isoformat()
        started = datetime.fromisoformat(self.started_at)
        completed = datetime.fromisoformat(self.completed_at)
        self.duration_seconds = round((completed - started).total_seconds(), 2)

    def overall_status(self) -> str:
        if self.errors and len(self.errors) > 0:
            failed = sum(1 for o in self.objects if o["status"] == "error")
            total = len(self.objects)
            if total > 0 and failed / total > 0.10:
                return "partial"
        if any(o["status"] == "error" for o in self.objects):
            return "partial"
        return "success"

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "client": self.client,
            "run_type": self.run_type,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_seconds": self.duration_seconds,
            "sf_api_version": self.sf_api_version,
            "sf_instance_url": self.sf_instance_url,
            "objects": self.objects,
            "metadata": self.metadata,
            "files": self.files,
            "errors": self.errors,
            "drive_folder_id": self.drive_folder_id,
            "drive_folder_url": self.drive_folder_url,
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)
        log.info(f"Manifest saved: {path}")
