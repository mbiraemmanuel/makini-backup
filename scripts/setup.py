"""
setup.py — Interactive Setup Wizard for the SF Backup Solution
==============================================================
Guides you through:
  1. Generating an RSA key pair for Salesforce JWT Bearer Flow
  2. Creating a Salesforce Connected App (with instructions)
  3. Providing a Google service account JSON
  4. Testing both connections live
  5. Writing the client config file and .env.local for the dashboard

Requirements (install once):
    pip install cryptography requests PyJWT

Run:
    python scripts/setup.py
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CLIENTS_DIR = REPO_ROOT / "clients"
DASHBOARD_ENV = REPO_ROOT / "dashboard" / ".env.local"


# ─── Colour helpers ───────────────────────────────────────────────────────────

def _c(text: str, code: str) -> str:
    if sys.platform == "win32":
        return text          # keep it simple on Windows terminals
    return f"\033[{code}m{text}\033[0m"

def bold(t: str) -> str:    return _c(t, "1")
def green(t: str) -> str:   return _c(t, "32")
def yellow(t: str) -> str:  return _c(t, "33")
def red(t: str) -> str:     return _c(t, "31")
def cyan(t: str) -> str:    return _c(t, "36")


# ─── Prompt helpers ───────────────────────────────────────────────────────────

def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"\n{bold(prompt)}{suffix}: ").strip()
    return val or default


def ask_choice(prompt: str, choices: list[str], default: str) -> str:
    opts = "/".join(f"[{c}]" if c == default else c for c in choices)
    while True:
        val = input(f"\n{bold(prompt)} ({opts}): ").strip().lower() or default.lower()
        if val in [c.lower() for c in choices]:
            return val
        print(red(f"  Please enter one of: {', '.join(choices)}"))


def pause(msg: str = "Press Enter to continue...") -> None:
    input(f"\n{yellow('>>>')} {msg}")


def section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {bold(title)}")
    print(f"{'─' * 60}")


def ok(msg: str) -> None:
    print(green(f"  ✓ {msg}"))


def info(msg: str) -> None:
    print(cyan(f"  {msg}"))


def warn(msg: str) -> None:
    print(yellow(f"  ! {msg}"))


# ─── RSA key generation ───────────────────────────────────────────────────────

def generate_rsa_key_pair(output_dir: Path) -> tuple[str, str]:
    """Generate RSA 2048-bit key pair. Returns (private_pem, cert_pem)."""
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        print(red("\n  'cryptography' package not found. Install it with:"))
        print(red("    pip install cryptography"))
        sys.exit(1)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()

    # Self-signed certificate (Salesforce requires a cert, not just a public key)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "sf-backup")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(
            datetime(
                datetime.now(timezone.utc).year + 2,
                datetime.now(timezone.utc).month,
                datetime.now(timezone.utc).day,
                tzinfo=timezone.utc,
            )
        )
        .sign(private_key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "private.pem").write_text(private_pem)
    (output_dir / "certificate.pem").write_text(cert_pem)

    return private_pem, cert_pem


# ─── Connection tests ─────────────────────────────────────────────────────────

def test_salesforce(consumer_key: str, username: str, private_pem: str, environment: str) -> str:
    """Return instance_url on success, raise on failure."""
    try:
        import jwt as pyjwt
        import requests
    except ImportError:
        print(red("  Install: pip install PyJWT requests"))
        sys.exit(1)

    endpoints = {
        "production": "https://login.salesforce.com/services/oauth2/token",
        "sandbox": "https://test.salesforce.com/services/oauth2/token",
    }
    audience = endpoints[environment].replace("/services/oauth2/token", "")
    now = int(time.time())
    payload = {"iss": consumer_key, "sub": username, "aud": audience, "exp": now + 300}
    assertion = pyjwt.encode(payload, private_pem, algorithm="RS256")

    r = requests.post(
        endpoints[environment],
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    token = data.get("access_token")
    instance_url = data.get("instance_url")
    if not token or not instance_url:
        raise ValueError(f"Unexpected response: {data}")
    return instance_url


def test_google_drive(sa_json: dict, folder_id: str) -> bool:
    """Returns True if the service account can list the Drive folder."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        print(red("  Install: pip install google-api-python-client google-auth"))
        sys.exit(1)

    creds = Credentials.from_service_account_info(
        sa_json, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id)",
        pageSize=1,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    return True


# ─── Main wizard ─────────────────────────────────────────────────────────────

def main() -> None:
    print(f"""
{'=' * 60}
  Salesforce Backup — Setup Wizard
{'=' * 60}
  This wizard will guide you through:
    1. Generating RSA keys for Salesforce authentication
    2. Configuring a Salesforce Connected App
    3. Providing a Google service account for Drive access
    4. Testing both connections
    5. Saving the client config + dashboard .env file
""")

    # ── Step 1: Basic client info ─────────────────────────────────
    section("Step 1 — Client Details")
    client_slug   = ask("Client slug (e.g. acme-corp, lowercase-hyphenated)")
    client_name   = ask("Client display name (e.g. Acme Corp)")
    sf_username    = ask("Salesforce integration user email")
    sf_environment = ask_choice("Salesforce environment", ["production", "sandbox"], "production")
    sf_api_version = ask("Salesforce API version", "59.0")
    retention_days = int(ask("Backup retention (days)", "90"))
    notify_email   = ask("Notification email for backup alerts")

    key_dir = REPO_ROOT / "keys" / client_slug

    # ── Step 2: RSA key generation ────────────────────────────────
    section("Step 2 — RSA Key Generation")
    info("Generating a 2048-bit RSA key pair for the Salesforce JWT Bearer Flow...")
    private_pem, cert_pem = generate_rsa_key_pair(key_dir)
    ok(f"Private key saved to: {key_dir / 'private.pem'}")
    ok(f"Certificate saved to: {key_dir / 'certificate.pem'}")

    # ── Step 3: Salesforce Connected App ──────────────────────────
    section("Step 3 — Salesforce Connected App Setup")
    print("""
  You need to create a Connected App in Salesforce. Follow these steps:

  1. Log into Salesforce → Setup → App Manager → New Connected App
  2. Fill in:
       Connected App Name : SF Backup - {slug}
       Contact Email      : {email}
  3. Enable OAuth Settings:
       ✓ Enable OAuth Settings
       Callback URL: https://login.salesforce.com/services/oauth2/success
       Selected OAuth Scopes: Full access (full)   ← or api + refresh_token
  4. Enable Digital Signatures:
       ✓ Use digital signatures
       Upload the certificate file:
         {cert}
  5. Click Save, then click "Manage Consumer Details" to get the Consumer Key.
  6. In the App Manager, click "Manage" → "Edit Policies":
       Permitted Users: Admin approved users are pre-authorized
  7. Assign the permission set / profile to your integration user.
""".format(
        slug=client_slug,
        email=notify_email,
        cert=key_dir / "certificate.pem",
    ))

    open_sf = ask_choice("Open Salesforce Setup in your browser now?", ["y", "n"], "y")
    if open_sf == "y":
        sf_base = "https://login.salesforce.com" if sf_environment == "production" else "https://test.salesforce.com"
        webbrowser.open(f"{sf_base}/lightning/setup/NavigationMenus/home")

    pause("Press Enter once you have uploaded the certificate and have the Consumer Key ready.")

    consumer_key = ask("Paste your Consumer Key (from 'Manage Consumer Details')")

    # ── Step 4: Test Salesforce connection ────────────────────────
    section("Step 4 — Test Salesforce Connection")
    info(f"Attempting JWT Bearer Flow as {sf_username}...")
    try:
        instance_url = test_salesforce(consumer_key, sf_username, private_pem, sf_environment)
        ok(f"Salesforce authenticated! Instance URL: {instance_url}")
    except Exception as exc:
        print(red(f"\n  ✗ Salesforce auth failed: {exc}"))
        print(yellow("""
  Common fixes:
    • Make sure you uploaded the certificate (not the private key) to the Connected App
    • Ensure "Admin approved users are pre-authorized" is set
    • Wait 2-10 minutes after creating the Connected App before the JWT flow works
    • Verify the integration user has the correct Permission Set assigned
"""))
        retry = ask_choice("Retry test?", ["y", "n"], "y")
        if retry == "y":
            try:
                instance_url = test_salesforce(consumer_key, sf_username, private_pem, sf_environment)
                ok(f"Salesforce authenticated! Instance URL: {instance_url}")
            except Exception as exc2:
                print(red(f"  Still failing: {exc2}"))
                warn("Continuing anyway — you can re-run 'python scripts/test_connection.py' later.")
                instance_url = f"https://{client_slug}.my.salesforce.com"
        else:
            instance_url = ask("Enter instance URL manually (e.g. https://yourorg.my.salesforce.com)")

    # ── Step 5: Google Drive / Service Account ────────────────────
    section("Step 5 — Google Drive Service Account")
    print("""
  You need a Google Cloud service account with Drive access.

  Option A — Use an existing service account JSON file:
    • Download the JSON key from GCP Console:
      IAM & Admin → Service Accounts → select your SA → Keys → Add Key → JSON
    • Ensure the SA has been shared on your Google Drive backup folder
      (right-click folder → Share → paste the SA email → Editor)

  Option B — Create a new service account (GCP Console):
    1. Go to: IAM & Admin → Service Accounts → Create Service Account
    2. Name it: sf-backup-{slug}
    3. Grant role: none required (Drive sharing handles it)
    4. Create a JSON key and download it
    5. Share your Drive backup root folder with the SA email
""".format(slug=client_slug))

    open_gcp = ask_choice("Open GCP Console in browser now?", ["y", "n"], "y")
    if open_gcp == "y":
        webbrowser.open("https://console.cloud.google.com/iam-admin/serviceaccounts")

    sa_json_path = ask("Path to the service account JSON file")
    sa_json_path_obj = Path(sa_json_path.strip('"').strip("'")).expanduser()

    if not sa_json_path_obj.exists():
        print(red(f"  File not found: {sa_json_path_obj}"))
        sys.exit(1)

    with sa_json_path_obj.open() as f:
        sa_json = json.load(f)

    ok(f"Loaded service account: {sa_json.get('client_email', '?')}")

    drive_folder_id = ask("Google Drive root backup folder ID\n  (Open the folder in Drive → copy the ID from the URL: /folders/<THIS PART>)")

    # ── Step 6: Test Google Drive ─────────────────────────────────
    section("Step 6 — Test Google Drive Connection")
    info("Attempting to list the Drive folder...")
    try:
        test_google_drive(sa_json, drive_folder_id)
        ok("Google Drive folder is accessible!")
    except Exception as exc:
        print(red(f"\n  ✗ Drive access failed: {exc}"))
        print(yellow("""
  Common fixes:
    • Share the Drive folder with the service account email (Editor role)
    • Wait a minute and try again
"""))
        warn("Continuing anyway. Run 'python scripts/test_connection.py' to re-test later.")

    # ── Step 7: Optional GCP / SendGrid settings ──────────────────
    section("Step 7 — Optional Settings")
    gcp_project  = ask("GCP project ID (for Secret Manager / Cloud Run)", "")
    gcp_region   = ask("GCP region", "us-central1")
    sendgrid_key = ask("SendGrid API key (leave blank to skip email notifications)", "")

    # ── Step 8: Write client config ───────────────────────────────
    section("Step 8 — Writing Configuration Files")

    config = {
        "client_slug": client_slug,
        "client_name": client_name,
        "sf_username": sf_username,
        "sf_api_version": sf_api_version,
        "sf_environment": sf_environment,
        "sf_instance_url": instance_url,
        "consumer_key": consumer_key,
        "backup": {
            "data": {
                "enabled": True,
                "schedule_cron": "0 2 * * *",
                "schedule_timezone": "America/Chicago",
                "incremental": True,
                "object_exclusions": [],
                "object_inclusions": [],
            },
            "metadata": {
                "enabled": True,
                "schedule_cron": "0 3 * * 0",
                "schedule_timezone": "America/Chicago",
                "metadata_type_exclusions": [],
            },
            "files": {
                "enabled": False,
                "schedule_cron": "0 4 * * 0",
                "max_file_size_mb": 500,
                "storage_backend": "drive",
            },
        },
        "retention_days": retention_days,
        "drive": {
            "root_folder_id": drive_folder_id,
            "storage_backend": "drive",
        },
        "notifications": {
            "alert_emails": [notify_email],
            "notify_on": ["error", "partial"],
        },
        "gcp": {
            "project_id": gcp_project,
            "region": gcp_region,
            "cloud_run_job": f"sf-backup-{client_slug}",
        },
    }

    CLIENTS_DIR.mkdir(parents=True, exist_ok=True)
    config_path = CLIENTS_DIR / f"{client_slug}-config.json"
    with config_path.open("w") as f:
        json.dump(config, f, indent=2)
    ok(f"Client config saved: {config_path}")

    # Write .env.local for the dashboard
    sa_b64 = base64.b64encode(json.dumps(sa_json).encode()).decode()
    env_lines = [
        f"GCP_PROJECT_ID={gcp_project}",
        f"DASHBOARD_SA_JSON_B64={sa_b64}",
        f"CLIENTS_DIR={CLIENTS_DIR}",
    ]
    if sendgrid_key:
        env_lines.append(f"SENDGRID_API_KEY={sendgrid_key}")

    DASHBOARD_ENV.parent.mkdir(parents=True, exist_ok=True)
    DASHBOARD_ENV.write_text("\n".join(env_lines) + "\n")
    ok(f"Dashboard .env.local saved: {DASHBOARD_ENV}")

    # Also write private key path to a local .env for the Python backend
    backend_env = REPO_ROOT / ".env"
    backend_env_content = (
        f"CLIENT_SLUG={client_slug}\n"
        f"SF_USERNAME={sf_username}\n"
        f"SF_ENVIRONMENT={sf_environment}\n"
        f"CONSUMER_KEY={consumer_key}\n"
        f"PRIVATE_KEY_PATH={key_dir / 'private.pem'}\n"
        f"DRIVE_ROOT_FOLDER_ID={drive_folder_id}\n"
        f"GCP_PROJECT_ID={gcp_project}\n"
    )
    backend_env.write_text(backend_env_content)
    ok(f"Backend .env saved: {backend_env}")
    warn(f"Keep {key_dir / 'private.pem'} secret — never commit it to git.")

    # ── Done ──────────────────────────────────────────────────────
    section("Setup Complete!")
    print(f"""
  Client   : {bold(client_name)} ({client_slug})
  Salesforce: {sf_username} @ {instance_url}
  Drive     : folder/{drive_folder_id}

  {bold('To start the dashboard:')}
    cd dashboard
    npm install          (if not done yet)
    npm run dev
    Open: http://localhost:3000

  {bold('To run a manual backup now:')}
    pip install -r requirements.txt
    python -m src.main

  {bold('To test connections any time:')}
    python scripts/test_connection.py
""")


if __name__ == "__main__":
    main()
