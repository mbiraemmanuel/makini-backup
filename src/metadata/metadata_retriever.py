"""
SFDX CLI subprocess wrapper.

Invokes `sf project retrieve start`, monitors for completion,
then zips the output directory.

Spec:
  sf project retrieve start \
    --target-org  {sf_username} \
    --retrieve-dir {output_dir} \
    --manifest    {package_xml_path} \
    --wait        60
"""
import subprocess
import shutil
import zipfile
from pathlib import Path

from src.utils.logger import log

_SF_BINARY = "sf"


def retrieve_metadata(
    sf_username: str,
    package_xml_path: Path,
    retrieve_dir: Path,
    wait_minutes: int = 60,
) -> Path:
    """
    Run `sf project retrieve start` and return the path to the retrieve_dir.

    Raises:
        subprocess.CalledProcessError: If the CLI exits with a non-zero code.
    """
    retrieve_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        _SF_BINARY,
        "project", "retrieve", "start",
        "--target-org", sf_username,
        "--retrieve-dir", str(retrieve_dir),
        "--manifest", str(package_xml_path),
        "--wait", str(wait_minutes),
        "--json",  # machine-readable output
    ]

    log.info(f"Running: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        log.error(f"sf retrieve stdout:\n{result.stdout}")
        log.error(f"sf retrieve stderr:\n{result.stderr}")
        raise subprocess.CalledProcessError(
            result.returncode, cmd, result.stdout, result.stderr
        )

    log.info("Metadata retrieve completed successfully")
    log.debug(f"sf output: {result.stdout[:500]}")
    return retrieve_dir


def zip_metadata(retrieve_dir: Path, date_str: str) -> Path:
    """
    Zip the metadata retrieve directory.

    Args:
        retrieve_dir: Directory containing SFDX source format output.
        date_str: Date string used in the zip filename (YYYY-MM-DD).

    Returns:
        Path to the created zip file.
    """
    zip_path = retrieve_dir.parent / f"metadata_{date_str}.zip"
    log.info(f"Zipping {retrieve_dir} → {zip_path}")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in retrieve_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(retrieve_dir.parent)
                zf.write(file_path, arcname)

    size = zip_path.stat().st_size
    log.info(f"Zip created: {zip_path} ({size:,} bytes)")
    return zip_path
