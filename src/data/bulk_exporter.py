"""
Bulk API 2.0 job management.

Creates a query job, polls until complete, downloads CSV results,
and streams them to a local file.

Spec reference (section 3):
  - Endpoint:   /services/data/vXX.0/jobs/query
  - Job type:   query
  - Content:    CSV
  - Max concurrent: 5
  - Poll interval: 10 s, timeout: 3600 s
  - Retry on: 503, 429, QUERY_TIMEOUT (up to 3 retries)
"""
import time
import requests
from pathlib import Path
from typing import Any

from src.auth.jwt_auth import SalesforceAuth
from src.utils.retry import api_retry
from src.utils.logger import log

_POLL_INTERVAL = 10   # seconds between status checks
_POLL_TIMEOUT = 3600  # 1 hour max


class BulkExporter:
    def __init__(self, auth: SalesforceAuth):
        self._auth = auth

    # ------------------------------------------------------------------
    # Job creation
    # ------------------------------------------------------------------

    @api_retry
    def _create_job(self, soql: str) -> str:
        """Submit a Bulk API 2.0 query job and return the job ID."""
        url = f"{self._auth.base_url()}/jobs/query"
        payload = {
            "operation": "query",
            "query": soql,
            "contentType": "CSV",
            "columnDelimiter": "COMMA",
            "lineEnding": "LF",
        }
        resp = requests.post(url, json=payload, headers=self._auth.session_headers(), timeout=60)
        resp.raise_for_status()
        job_id = resp.json()["id"]
        log.info(f"Bulk job created: {job_id}")
        return job_id

    # ------------------------------------------------------------------
    # Polling
    # ------------------------------------------------------------------

    @api_retry
    def _get_job_status(self, job_id: str) -> dict[str, Any]:
        url = f"{self._auth.base_url()}/jobs/query/{job_id}"
        resp = requests.get(url, headers=self._auth.session_headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _poll_until_complete(self, job_id: str) -> dict[str, Any]:
        """Block until job reaches a terminal state; raise on failure."""
        elapsed = 0
        while elapsed < _POLL_TIMEOUT:
            status_data = self._get_job_status(job_id)
            state = status_data.get("state", "")
            log.debug(f"Job {job_id} state={state} elapsed={elapsed}s")

            if state == "JobComplete":
                return status_data
            if state in ("Failed", "Aborted"):
                raise RuntimeError(
                    f"Bulk job {job_id} ended in state={state}: "
                    f"{status_data.get('errorMessage', 'unknown error')}"
                )

            time.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL

        raise TimeoutError(f"Bulk job {job_id} did not complete within {_POLL_TIMEOUT}s")

    # ------------------------------------------------------------------
    # Result download
    # ------------------------------------------------------------------

    @api_retry
    def _download_results(self, job_id: str, output_path: Path) -> int:
        """
        Stream CSV results to output_path. Returns total bytes written.

        Handles Salesforce pagination via the `locator` cursor.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        total_bytes = 0
        locator = None
        first_chunk = True

        with open(output_path, "wb") as f:
            while True:
                url = f"{self._auth.base_url()}/jobs/query/{job_id}/results"
                params: dict[str, Any] = {"maxRecords": 50000}
                if locator:
                    params["locator"] = locator

                resp = requests.get(
                    url,
                    headers=self._auth.session_headers(),
                    params=params,
                    stream=True,
                    timeout=300,
                )
                resp.raise_for_status()

                for chunk in resp.iter_content(chunk_size=10 * 1024 * 1024):  # 10 MB chunks
                    if first_chunk:
                        # Prepend UTF-8 BOM for Excel compatibility
                        f.write(b"\xef\xbb\xbf")
                        first_chunk = False
                    f.write(chunk)
                    total_bytes += len(chunk)

                locator = resp.headers.get("Sforce-Locator")
                if not locator or locator == "null":
                    break

        log.info(f"Downloaded {total_bytes:,} bytes for job {job_id} -> {output_path}")
        return total_bytes

    def _delete_job(self, job_id: str) -> None:
        try:
            url = f"{self._auth.base_url()}/jobs/query/{job_id}"
            requests.delete(url, headers=self._auth.session_headers(), timeout=30)
        except Exception as exc:
            log.warning(f"Could not delete job {job_id}: {exc}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def export_object(
        self,
        soql: str,
        output_path: Path,
    ) -> dict[str, Any]:
        """
        Run a full Bulk API 2.0 export for a given SOQL query.

        Args:
            soql: The SOQL query string.
            output_path: Destination CSV file path.

        Returns:
            dict with keys: job_id, record_count, file_size_bytes.
        """
        job_id = self._create_job(soql)
        try:
            status = self._poll_until_complete(job_id)
            record_count = status.get("numberRecordsProcessed", 0)
            file_size = self._download_results(job_id, output_path)
            return {
                "job_id": job_id,
                "record_count": record_count,
                "file_size_bytes": file_size,
            }
        finally:
            self._delete_job(job_id)
