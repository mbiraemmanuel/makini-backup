"""
Discover all queryable, retrievable sObjects in a Salesforce org.

Logic per spec:
  - Call GET /sobjects
  - Include object if: queryable=True AND retrieveable=True
                       AND (createable=True OR updateable=True)
  - Exclude objects in the default exclusion list
"""
from __future__ import annotations
import requests
from typing import Any

from src.auth.jwt_auth import SalesforceAuth
from src.utils.retry import api_retry
from src.utils.logger import log

# Objects that are not useful to back up
DEFAULT_EXCLUSIONS: set[str] = {
    "AggregateResult",
    "ApexLog",
    "AsyncApexJob",
    "BackgroundOperation",
    "BulkApiV2EventStore",
    "CronJobDetail",
    "CronTrigger",
    "EntityDefinition",
    "FieldDefinition",
    "FlowVariableView",
    "UserRecordAccess",
    "Vote",
    "LoginHistory",
    "SetupAuditTrail",
}


@api_retry
def _describe_global(auth: SalesforceAuth) -> list[dict[str, Any]]:
    url = f"{auth.base_url()}/sobjects"
    resp = requests.get(url, headers=auth.session_headers(), timeout=60)
    resp.raise_for_status()
    return resp.json().get("sobjects", [])


def get_exportable_objects(
    auth: SalesforceAuth,
    extra_exclusions: list[str] | None = None,
    inclusions_only: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Return a filtered list of sObject descriptors suitable for data export.

    Args:
        auth: Authenticated SalesforceAuth instance.
        extra_exclusions: Additional object API names to exclude (from client config).
        inclusions_only: If non-empty, only return objects in this list (allowlist).

    Returns:
        List of sObject metadata dicts, each containing at least 'name', 'label',
        'queryable', 'retrieveable', 'createable', 'updateable'.
    """
    exclusions = DEFAULT_EXCLUSIONS | set(extra_exclusions or [])
    sobjects = _describe_global(auth)

    exportable = []
    for obj in sobjects:
        name = obj.get("name", "")
        if name in exclusions:
            continue
        if inclusions_only and name not in inclusions_only:
            continue
        if not obj.get("queryable"):
            continue
        if not obj.get("retrieveable"):
            continue
        if not (obj.get("createable") or obj.get("updateable")):
            continue
        exportable.append(obj)

    log.info(f"Found {len(exportable)} exportable objects (of {len(sobjects)} total)")
    return exportable


@api_retry
def describe_object(auth: SalesforceAuth, sobject_name: str) -> dict[str, Any]:
    """
    Return the full describe result for a single sObject.

    Used to enumerate all fields before building the SOQL query.
    """
    url = f"{auth.base_url()}/sobjects/{sobject_name}/describe"
    resp = requests.get(url, headers=auth.session_headers(), timeout=60)
    resp.raise_for_status()
    return resp.json()


def get_exportable_fields(describe_result: dict[str, Any]) -> list[str]:
    """
    Return field API names suitable for Bulk API export from a describe payload.

    Excludes:
      - base64 (binary) fields — handled by file_downloader
    """
    fields = []
    for field in describe_result.get("fields", []):
        if field.get("type") == "base64":
            continue  # binary; exported separately
        fields.append(field["name"])
    return fields
