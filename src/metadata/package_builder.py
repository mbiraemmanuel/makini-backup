"""
Dynamic package.xml generation.

Queries the Metadata API to discover available metadata types then
produces a package.xml with wildcard members (*) where supported.
Types that require explicit member enumeration are handled specially.
"""
from __future__ import annotations
import xml.etree.ElementTree as ET
import requests
from pathlib import Path
from typing import Any

from src.auth.jwt_auth import SalesforceAuth
from src.utils.retry import api_retry
from src.utils.logger import log

# Types that do NOT support wildcard (*) — must enumerate members explicitly
_NO_WILDCARD_TYPES = {
    "Report",
    "Dashboard",
    "EmailTemplate",
    "Document",
    "StandardValueSet",
}

# Types that commonly exceed 10k components and need chunking
_CHUNKED_TYPES = {"Report", "Dashboard", "EmailTemplate", "Document"}


@api_retry
def _fetch_metadata_types(auth: SalesforceAuth) -> list[dict[str, Any]]:
    url = f"{auth.base_url()}/describe/metadataTypes"
    resp = requests.get(url, headers=auth.session_headers(), timeout=60)
    resp.raise_for_status()
    return resp.json().get("metadataObjects", [])


@api_retry
def _list_metadata_members(
    auth: SalesforceAuth,
    metadata_type: str,
) -> list[str]:
    """
    Use the Metadata API listMetadata call to enumerate members of a type.
    Falls back to an empty list if the type has no members.
    """
    from simple_salesforce import Salesforce, SalesforceError

    sf = Salesforce(
        instance_url=auth.instance_url,
        session_id=auth.access_token,
        version=auth.api_version,
    )
    try:
        result = sf.listMetadata([{"type": metadata_type}], double_prefix=False)
        return [item["fullName"] for item in (result or [])]
    except SalesforceError as exc:
        log.warning(f"listMetadata failed for {metadata_type}: {exc}")
        return []


def build_package_xml(
    auth: SalesforceAuth,
    output_path: Path,
    type_exclusions: list[str] | None = None,
) -> Path:
    """
    Build a package.xml suitable for `sf project retrieve start`.

    Args:
        auth: Authenticated session.
        output_path: Where to write the package.xml file.
        type_exclusions: Metadata type names to skip.

    Returns:
        Path to the written package.xml.
    """
    excluded = set(type_exclusions or [])
    api_version = auth.api_version

    all_types = _fetch_metadata_types(auth)
    log.info(f"Discovered {len(all_types)} metadata types")

    # Build XML tree
    root = ET.Element("Package", xmlns="http://soap.sforce.com/2006/04/metadata")

    for md_type in all_types:
        type_name = md_type.get("xmlName", "")
        if type_name in excluded:
            continue

        members: list[str] = []

        if type_name in _NO_WILDCARD_TYPES:
            members = _list_metadata_members(auth, type_name)
            if not members:
                log.debug(f"No members found for {type_name}, skipping")
                continue
        else:
            members = ["*"]

        types_elem = ET.SubElement(root, "types")
        for member in members:
            m = ET.SubElement(types_elem, "members")
            m.text = member
        n = ET.SubElement(types_elem, "name")
        n.text = type_name

    version_elem = ET.SubElement(root, "version")
    version_elem.text = api_version

    # Pretty-print
    _indent(root)
    tree = ET.ElementTree(root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), encoding="utf-8", xml_declaration=True)
    log.info(f"package.xml written to {output_path}")
    return output_path


def _indent(elem: ET.Element, level: int = 0) -> None:
    """Add pretty-print indentation in-place."""
    indent = "\n" + "    " * level
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "    "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        for child in elem:
            _indent(child, level + 1)
        if not child.tail or not child.tail.strip():  # noqa: F821
            child.tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent
