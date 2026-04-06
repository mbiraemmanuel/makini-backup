"""
Retention manager — deletes Drive folders older than retention_days.

Spec:
  - Runs at end of every backup job
  - Lists all dated folders in /SF Backups/
  - Deletes folders older than retention_days using Drive API files().delete()
  - Logs deleted folders in manifest
"""
from datetime import datetime, timezone, timedelta

from src.storage.drive_client import DriveClient
from src.utils.logger import log

_DATE_FORMAT = "%Y-%m-%d"


def cleanup_old_backups(
    drive: DriveClient,
    retention_days: int,
) -> list[str]:
    """
    Delete backup folders older than retention_days from the Drive root folder.

    Args:
        drive: Authenticated DriveClient.
        retention_days: Number of days to keep backups.

    Returns:
        List of deleted folder names.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    folders = drive.list_folders(drive.root_folder_id)

    deleted = []
    for folder in folders:
        name = folder.get("name", "")
        # Only process YYYY-MM-DD named folders
        try:
            folder_date = datetime.strptime(name, _DATE_FORMAT).replace(tzinfo=timezone.utc)
        except ValueError:
            log.debug(f"Skipping non-date folder: {name}")
            continue

        if folder_date < cutoff:
            folder_id = folder["id"]
            log.info(f"Deleting old backup folder: {name} ({folder_id})")
            try:
                drive.delete_file(folder_id)
                deleted.append(name)
            except Exception as exc:
                log.warning(f"Failed to delete folder {name}: {exc}")

    log.info(f"Retention cleanup complete. Deleted {len(deleted)} folder(s): {deleted}")
    return deleted
