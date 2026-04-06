# Makini SF Backup Solution

Automated Salesforce full-org backup to Google Drive, built for Cloud Run.
See `sf_backup_tech_specs.txt` for full technical specifications.

---

## Repository Structure

```
sf-backup/
  Dockerfile                        Container image definition
  requirements.txt                  Python dependencies
  clients/{client-slug}-config.json One config file per client
  src/main.py                       Entry point
  src/auth/jwt_auth.py              JWT Bearer Flow authentication
  src/data/object_enumerator.py     Discover exportable sObjects
  src/data/bulk_exporter.py         Bulk API 2.0 job management
  src/data/file_downloader.py       ContentVersion + Attachment streaming
  src/data/incremental.py           LastModifiedDate watermark logic
  src/metadata/package_builder.py   Dynamic package.xml generation
  src/metadata/metadata_retriever.py SFDX CLI wrapper + zip
  src/storage/drive_client.py       Google Drive API v3 wrapper
  src/storage/gcs_client.py         GCS fallback for large file runs
  src/storage/retention_manager.py  Delete old backup folders
  src/notifications/notifier.py     SendGrid email summaries + alerts
  src/utils/manifest.py             manifest.json builder
  src/utils/logger.py               Structured logging (loguru)
  src/utils/secrets.py              GCP Secret Manager client
  src/utils/retry.py                Tenacity retry decorators
  deploy/cloud_run_job.yaml         Cloud Run job spec template
  deploy/scheduler_data.yaml        Cloud Scheduler nightly data job
  deploy/scheduler_metadata.yaml    Cloud Scheduler weekly metadata job
  scripts/onboard_client.sh         New client setup automation
  scripts/rotate_keys.sh            Annual RSA key rotation
  scripts/test_connection.py        Validate SF + Drive auth
```

---

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Onboard a new client

```bash
./scripts/onboard_client.sh <client-slug> <sf-username> <gcp-project-id> <drive-folder-id> <alert-email>
```

### 3. Test connectivity

```bash
CLIENT_SLUG=acme GCP_PROJECT_ID=makini-sf-backup-prod python3 scripts/test_connection.py
```

### 4. Run locally

```bash
CLIENT_SLUG=acme BACKUP_MODE=full GCP_PROJECT_ID=makini-sf-backup-prod python src/main.py
```

### 5. Deploy to Cloud Run

```bash
IMAGE="us-central1-docker.pkg.dev/PROJECT/sf-backup/backup-runner:latest"
gcloud builds submit --tag "" .
gcloud run jobs execute sf-backup-acme-data --region=us-central1
```

---

## Salesforce Package (Unlocked Package)

The `force-app/` directory is a Salesforce DX Unlocked Package that can be built and installed directly into any client org. It ships with everything pre-configured — the client just uploads one certificate after install.

### What the package installs

| Component | API Name | Purpose |
|-----------|----------|---------|
| Connected App | `Makini_SF_Backup` | JWT Bearer Flow app — pre-configured with API + RefreshToken scopes |
| Permission Set | `Makini_Backup_Integration` | Grants `ApiEnabled`, `ViewAllData`, and Connected App access |
| Custom Metadata Type | `Backup_Configuration__mdt` | Stores per-client config (GCP project, Drive folder, schedule, etc.) |
| Default CMT Record | `Backup_Configuration.Default` | Template record — edit values post-install |
| Post-Install Handler | `MakiniBackupInstallHandler` | Emails the installing admin with post-install checklist |
| Scheduler | `MakiniBackupScheduler` | Schedulable Apex that triggers the Cloud Run job on a cron |
| Callout Helper | `MakiniBackupCallout` | `@future` callout — POSTs to the dashboard `/api/gcp/trigger-job` |

### Build and publish the package

```bash
# Authenticate to your Dev Hub org
sf org login web --set-default-dev-hub --alias DevHub

# Create the package (one-time)
sf package create --name "Makini-SF-Backup" --type Unlocked --path force-app --target-dev-hub DevHub

# Create a new package version
sf package version create --package "Makini-SF-Backup" --installation-key-bypass --wait 20 --target-dev-hub DevHub

# Once created, promote the version for production installs
sf package version promote --package "Makini-SF-Backup@1.0.0-1" --target-dev-hub DevHub
```

### Install into a client org

```bash
# Via SF CLI (recommended)
sf package install --package "Makini-SF-Backup@1.0.0-1" --target-org <client-alias> --wait 10

# Or share the install URL — client pastes it into their browser:
# https://login.salesforce.com/packaging/installPackage.apexp?p0=<PACKAGE_VERSION_ID>
# (use test.salesforce.com for sandbox)
```

### Post-install checklist (takes ~5 minutes)

After the package is installed the admin receives an email with these steps:

1. **Create integration user** — a Salesforce user the backup job will authenticate as.  
   Suggested username: `sf-backup@yourorg.com.sandbox`

2. **Assign permission set** — assign `Makini Backup Integration` to the integration user.

3. **Generate RSA key pair** — use the Makini Setup Wizard at `/setup` in the dashboard  
   (click **Generate Keys** on Step 2). Download `certificate.pem`.

4. **Upload certificate** — Setup → App Manager → **Makini SF Backup** → Edit  
   → Enable JWT Bearer Flow → Certificate Upload → upload `certificate.pem`.

5. **Copy Consumer Key** — Setup → App Manager → **Makini SF Backup** → View  
   → copy the **Consumer Key** value.

6. **Finish setup wizard** — paste the Consumer Key into Step 2 of the wizard and click  
   **Test Salesforce Connection**, then complete Steps 3 and 4.

7. **(Optional) Schedule from Apex** — to trigger backups from within Salesforce instead of  
   GCP Cloud Scheduler, run from Developer Console → Execute Anonymous:
   ```apex
   System.schedule('Makini Daily Backup', '0 0 2 * * ?', new MakiniBackupScheduler());
   ```

---

## Backup Modes

| Mode | What runs |
|------|-----------|
| data | Bulk API 2.0 export of all sObjects to CSV |
| metadata | SFDX retrieve zipped |
| files | ContentVersion + Attachment streaming |
| full | All three phases |

---

*Makini Consulting - makiniconsulting.com*
