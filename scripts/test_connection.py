#!/usr/bin/env python3
"""
scripts/test_connection.py
==========================
Validates Salesforce JWT auth and Google Drive connectivity for a client.

Usage:
    CLIENT_SLUG=acme GCP_PROJECT_ID=makini-sf-backup-prod python3 scripts/test_connection.py

Exit:
    0 — all checks passed
    1 — one or more checks failed
"""
import json
import os
import sys
import requests

# Ensure src/ is on the path when run as a script
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.utils.logger import log
from src.utils.secrets import get_client_secrets
from src.auth.jwt_auth import SalesforceAuth


def check_sf_auth(secrets: dict, config: dict) -> bool:
    log.info("--- Salesforce JWT Auth ---")
    try:
        auth = SalesforceAuth(
            consumer_key=secrets["consumer_key"],
            username=secrets["username"],
            private_key_pem=secrets["private_key"],
            environment=config.get("sf_environment", "production"),
            api_version=config.get("sf_api_version", "59.0"),
        )
        auth.authenticate()
        log.info(f"  ✓  Access token obtained")
        log.info(f"  ✓  Instance URL: {auth.instance_url}")

        # Quick API call: check limits
        limits_url = f"{auth.base_url()}/limits"
        resp = requests.get(limits_url, headers=auth.session_headers(), timeout=30)
        resp.raise_for_status()
        limits = resp.json()
        daily = limits.get("DailyApiRequests", {})
        log.info(
            f"  ✓  Daily API requests: {daily.get('Remaining', '?')} remaining "
            f"/ {daily.get('Max', '?')} total"
        )
        return True
    except Exception as exc:
        log.error(f"  ✗  Salesforce auth failed: {exc}")
        return False


def check_drive(secrets: dict, config: dict) -> bool:
    log.info("--- Google Drive ---")
    try:
        from src.storage.drive_client import DriveClient

        drive_config = config.get("drive", {})
        root_folder_id = drive_config.get("root_folder_id")
        if not root_folder_id or root_folder_id == "REPLACE_WITH_DRIVE_FOLDER_ID":
            log.warning("  ⚠  root_folder_id not configured in client config — skipping Drive check")
            return True

        drive = DriveClient(secrets["sa_json"], root_folder_id)
        folders = drive.list_folders(root_folder_id)
        log.info(f"  ✓  Drive folder accessible. Child folders: {len(folders)}")
        log.info(f"  ✓  Drive URL: {drive.folder_url(root_folder_id)}")
        return True
    except Exception as exc:
        log.error(f"  ✗  Drive check failed: {exc}")
        return False


def main() -> None:
    client_slug = os.environ.get("CLIENT_SLUG")
    if not client_slug:
        log.error("CLIENT_SLUG environment variable is required")
        sys.exit(1)

    log.info(f"Testing connections for client: {client_slug}")
    log.info("")

    # Load config
    config_path = f"clients/{client_slug}-config.json"
    if not os.path.exists(config_path):
        log.error(f"Client config not found: {config_path}")
        sys.exit(1)
    with open(config_path) as f:
        config = json.load(f)

    # Fetch secrets
    log.info("Fetching secrets from GCP Secret Manager...")
    secrets = get_client_secrets(client_slug)
    log.info("")

    results = {
        "Salesforce Auth": check_sf_auth(secrets, config),
        "Google Drive": check_drive(secrets, config),
    }

    log.info("")
    log.info("=== Test Results ===")
    all_passed = True
    for check, passed in results.items():
        status = "PASS" if passed else "FAIL"
        log.info(f"  {check}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        log.info("\nAll checks passed ✓")
        sys.exit(0)
    else:
        log.error("\nOne or more checks FAILED ✗")
        sys.exit(1)


if __name__ == "__main__":
    main()
