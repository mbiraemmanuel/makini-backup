"""
SendGrid email notifier.

Sends:
  - Immediate alerts (auth failure, abort)
  - End-of-run summary (always)
  - Threshold alerts (> 10% object failures)
"""
import json
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from src.utils.manifest import Manifest
from src.utils.logger import log

_FROM_EMAIL = "sf-backup@makiniconsulting.com"
_FROM_NAME = "Makini SF Backup"


def _send(
    api_key: str,
    to_emails: list[str],
    subject: str,
    html_body: str,
) -> None:
    if not to_emails:
        log.warning("No recipient emails configured; skipping notification")
        return

    message = Mail(
        from_email=(_FROM_EMAIL, _FROM_NAME),
        to_emails=to_emails,
        subject=subject,
        html_content=html_body,
    )
    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        log.info(f"Notification sent (status {response.status_code}) to {to_emails}")
    except Exception as exc:
        log.error(f"Failed to send notification: {exc}")


def send_run_summary(
    api_key: str,
    to_emails: list[str],
    manifest: Manifest,
) -> None:
    """Send an end-of-run email summary regardless of outcome."""
    data = manifest.to_dict()
    status = manifest.overall_status()
    client = manifest.client

    success_count = sum(1 for o in data["objects"] if o["status"] == "success")
    error_count = sum(1 for o in data["objects"] if o["status"] == "error")
    skipped_count = sum(1 for o in data["objects"] if o["status"] == "skipped")

    subject = f"[SF Backup] {client} — {status.upper()} — {data['started_at'][:10]}"

    rows = "".join(
        f"<tr><td>{o['name']}</td><td>{o['record_count']:,}</td>"
        f"<td>{o['status']}</td><td>{o.get('error_message') or ''}</td></tr>"
        for o in data["objects"]
    )

    html = f"""
    <h2>Salesforce Backup Report — {client}</h2>
    <p><strong>Status:</strong> {status.upper()}</p>
    <p><strong>Run ID:</strong> {data['run_id']}</p>
    <p><strong>Type:</strong> {data['run_type']}</p>
    <p><strong>Started:</strong> {data['started_at']}</p>
    <p><strong>Completed:</strong> {data['completed_at']}</p>
    <p><strong>Duration:</strong> {data['duration_seconds']}s</p>
    <p><strong>Objects:</strong> {success_count} success / {error_count} errors / {skipped_count} skipped</p>
    <p><strong>Drive Folder:</strong> <a href="{data.get('drive_folder_url', '#')}">{data.get('drive_folder_url', 'N/A')}</a></p>
    <hr>
    <h3>Object Results</h3>
    <table border="1" cellpadding="4" cellspacing="0">
      <thead><tr><th>Object</th><th>Records</th><th>Status</th><th>Error</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    {"<h3>Errors</h3><ul>" + "".join(f"<li>{e}</li>" for e in data["errors"]) + "</ul>" if data["errors"] else ""}
    <p><em>Makini Consulting — makiniconsulting.com</em></p>
    """
    _send(api_key, to_emails, subject, html)


def send_alert(
    api_key: str,
    to_emails: list[str],
    client: str,
    subject_suffix: str,
    message: str,
) -> None:
    """Send an immediate alert email."""
    subject = f"[SF Backup ALERT] {client} — {subject_suffix}"
    html = f"""
    <h2>SF Backup Alert — {client}</h2>
    <p>{message}</p>
    <p><em>Makini Consulting — makiniconsulting.com</em></p>
    """
    _send(api_key, to_emails, subject, html)
