"""
GCP Secret Manager client.
Fetches secrets by name for a given client slug and GCP project.
Falls back to a local <clients-dir>/<slug>-secrets.json file when
Secret Manager is not configured (useful for local development).
"""
from __future__ import annotations
import json
import os
import pathlib
from src.utils.logger import log


def _local_secrets_path(slug: str) -> pathlib.Path | None:
    """Return path to local secrets file if it exists."""
    clients_dir = os.environ.get(
        "CLIENTS_DIR",
        str(pathlib.Path(__file__).resolve().parents[2] / "clients"),
    )
    p = pathlib.Path(clients_dir) / f"{slug}-secrets.json"
    return p if p.exists() else None


def _client():
    from google.cloud import secretmanager
    return secretmanager.SecretManagerServiceClient()


def get_secret(secret_id: str, project_id: str | None = None, version: str = "latest") -> str:
    """
    Retrieve the latest (or specified) version of a secret from GCP Secret Manager.

    Args:
        secret_id: The full secret name (e.g. 'sf-acme-private-key') or
                   a resource name like 'projects/.../secrets/.../versions/...'.
        project_id: GCP project ID. Falls back to GCP_PROJECT_ID env var.
        version: Secret version, defaults to 'latest'.

    Returns:
        The secret payload as a UTF-8 string.
    """
    project_id = project_id or os.environ["GCP_PROJECT_ID"]
    client = _client()

    if not secret_id.startswith("projects/"):
        name = f"projects/{project_id}/secrets/{secret_id}/versions/{version}"
    else:
        name = secret_id

    log.debug(f"Fetching secret: {name}")
    response = client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode("utf-8")
    return payload


def get_client_secrets(client_slug: str, project_id: str | None = None) -> dict[str, str]:
    """
    Fetch all standard secrets for a client.
    Priority: local secrets file → GCP Secret Manager.

    Returns:
        dict with keys: private_key, consumer_key, username, instance_url, sa_json, sendgrid_api_key
    """
    local = _local_secrets_path(client_slug)
    if local:
        log.info(f"Loading secrets from local file: {local}")
        data = json.loads(local.read_text(encoding="utf-8-sig"))
        # Allow env var overrides on top of the file
        return {
            "private_key":      os.environ.get("SF_PRIVATE_KEY",      data.get("private_key", "")),
            "consumer_key":     os.environ.get("SF_CONSUMER_KEY",     data.get("consumer_key", "")),
            "username":         os.environ.get("SF_USERNAME",         data.get("username", "")),
            "instance_url":     os.environ.get("SF_INSTANCE_URL",     data.get("instance_url", "")),
            "sa_json":          os.environ.get("GCP_SA_JSON",         data.get("sa_json", "")),
            "sendgrid_api_key": os.environ.get("SENDGRID_API_KEY",    data.get("sendgrid_api_key", "")),
        }

    # Fall back to Secret Manager
    project_id = project_id or os.environ["GCP_PROJECT_ID"]
    slug = client_slug
    return {
        "private_key":      get_secret(f"sf-{slug}-private-key", project_id),
        "consumer_key":     get_secret(f"sf-{slug}-consumer-key", project_id),
        "username":         get_secret(f"sf-{slug}-username", project_id),
        "instance_url":     get_secret(f"sf-{slug}-instance-url", project_id),
        "sa_json":          get_secret(f"gcp-{slug}-sa-json", project_id),
        "sendgrid_api_key": get_secret("sendgrid-api-key", project_id),
    }
