"""
Incremental backup filter logic.

Determines the `since_timestamp` for objects that support LastModifiedDate,
and provides a helper that decides whether an object supports incremental export.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

from src.utils.logger import log

# Objects that do NOT have LastModifiedDate — always run as full exports
_NO_LAST_MODIFIED = {
    "ContentDocumentLink",
    "ContentFolderMember",
    "ContentFolderItem",
    "FeedComment",
    "FeedLike",
    "FeedTrackedChange",
    "UserRole",
    "Group",
    "GroupMember",
    "QueueSobject",
}

# Path where the last-run timestamps are persisted between runs
_WATERMARK_FILE = Path("/tmp/incremental_watermarks.json")


def load_watermarks() -> dict[str, str]:
    """Load saved watermarks from disk (or return empty dict if first run)."""
    if _WATERMARK_FILE.exists():
        with open(_WATERMARK_FILE, "r") as f:
            return json.load(f)
    return {}


def save_watermarks(watermarks: dict[str, str]) -> None:
    """Persist watermarks dict to disk for next run."""
    _WATERMARK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_WATERMARK_FILE, "w") as f:
        json.dump(watermarks, f, indent=2)
    log.debug(f"Watermarks saved to {_WATERMARK_FILE}")


def supports_incremental(object_name: str, describe_result: dict) -> bool:
    """
    Return True if the object has a LastModifiedDate field
    and is not in the known exclusion set.
    """
    if object_name in _NO_LAST_MODIFIED:
        return False
    field_names = {f["name"] for f in describe_result.get("fields", [])}
    return "LastModifiedDate" in field_names


def build_soql(
    object_name: str,
    fields: list[str],
    since_timestamp: str | None = None,
) -> str:
    """
    Build a SOQL query string.

    Args:
        object_name: API name of the sObject.
        fields: List of field API names to select.
        since_timestamp: ISO 8601 datetime for incremental filter.
                         If None, runs as a full export.

    Returns:
        SOQL query string.
    """
    field_list = ", ".join(fields)
    query = f"SELECT {field_list} FROM {object_name}"

    if since_timestamp:
        query += f" WHERE LastModifiedDate >= {since_timestamp}"

    query += " ORDER BY Id"
    log.debug(f"Built SOQL for {object_name}: {query[:120]}...")
    return query
