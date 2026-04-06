"""
Google Cloud Storage fallback for large file backups (>= 10 GB total).

Spec:
  Bucket naming: makini-sf-files-{client-slug}
  Storage class: NEARLINE
"""
from __future__ import annotations
from pathlib import Path

from google.cloud import storage
from google.oauth2 import service_account
import json

from src.utils.retry import api_retry
from src.utils.logger import log


def _build_client(sa_json_str: str) -> storage.Client:
    info = json.loads(sa_json_str)
    creds = service_account.Credentials.from_service_account_info(info)
    return storage.Client(credentials=creds, project=info.get("project_id"))


class GCSClient:
    def __init__(self, sa_json_str: str, client_slug: str, project_id: str):
        self._client = _build_client(sa_json_str)
        self._client_slug = client_slug
        self._project_id = project_id
        self._bucket_name = f"makini-sf-files-{client_slug}"

    @api_retry
    def ensure_bucket(self) -> storage.Bucket:
        """Create the bucket with NEARLINE storage if it doesn't exist."""
        from google.api_core.exceptions import NotFound
        try:
            bucket = self._client.get_bucket(self._bucket_name)
            log.debug(f"GCS bucket exists: {self._bucket_name}")
            return bucket
        except NotFound:
            bucket = self._client.bucket(self._bucket_name)
            bucket.storage_class = "NEARLINE"
            created = self._client.create_bucket(bucket, location="US")
            log.info(f"Created GCS bucket: {self._bucket_name}")
            return created

    @api_retry
    def upload_file(
        self,
        local_path: Path,
        gcs_prefix: str,
        file_name: str | None = None,
    ) -> str:
        """
        Upload a local file to GCS under gcs_prefix/.

        Returns:
            gs:// URI of the uploaded blob.
        """
        bucket = self.ensure_bucket()
        name = file_name or local_path.name
        blob_name = f"{gcs_prefix}/{name}"
        blob = bucket.blob(blob_name)

        log.info(f"Uploading to gs://{self._bucket_name}/{blob_name}")
        blob.upload_from_filename(str(local_path), timeout=600)

        uri = f"gs://{self._bucket_name}/{blob_name}"
        log.info(f"Uploaded: {uri}")
        return uri
