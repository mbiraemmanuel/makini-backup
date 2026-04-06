#!/usr/bin/env bash
# =============================================================================
# onboard_client.sh — Automate new client onboarding to the SF Backup solution
# =============================================================================
# Usage:
#   ./scripts/onboard_client.sh <client-slug> <sf-username> <gcp-project-id> \
#       <drive-folder-id> <notification-email>
#
# Prerequisites (must be available on PATH):
#   - openssl, gcloud, python3
# =============================================================================
set -euo pipefail

if [[ $# -lt 5 ]]; then
  echo "Usage: $0 <client-slug> <sf-username> <gcp-project-id> <drive-folder-id> <notification-email>"
  exit 1
fi

CLIENT_SLUG="$1"
SF_USERNAME="$2"
GCP_PROJECT="$3"
DRIVE_FOLDER_ID="$4"
NOTIFICATION_EMAIL="$5"

SERVICE_ACCOUNT="sf-backup-${CLIENT_SLUG}@${GCP_PROJECT}.iam.gserviceaccount.com"
KEY_DIR="$(mktemp -d)"

echo ""
echo "============================================================"
echo " SF Backup — Onboarding: ${CLIENT_SLUG}"
echo "============================================================"
echo ""

# ------------------------------------------------------------------
# 1. Generate RSA key pair
# ------------------------------------------------------------------
echo "[1/9] Generating RSA key pair..."
openssl genrsa -out "${KEY_DIR}/private.pem" 2048
openssl req -new -x509 \
  -key "${KEY_DIR}/private.pem" \
  -out "${KEY_DIR}/certificate.pem" \
  -days 365 \
  -subj "/CN=${CLIENT_SLUG}-sf-backup"

echo "      Private key : ${KEY_DIR}/private.pem"
echo "      Certificate : ${KEY_DIR}/certificate.pem"
echo ""
echo "  >>> Upload ${KEY_DIR}/certificate.pem to your Salesforce Connected App."
echo "  >>> Press Enter when the Connected App is configured with the certificate."
read -r

# ------------------------------------------------------------------
# 2. Collect Salesforce secrets interactively
# ------------------------------------------------------------------
echo "[2/9] Collecting Salesforce secrets..."
read -rsp "      Enter Consumer Key (from Connected App): " CONSUMER_KEY; echo
read -rsp "      Enter Salesforce instance URL (e.g. https://myorg.my.salesforce.com): " INSTANCE_URL; echo

# ------------------------------------------------------------------
# 3. Create GCP Service Account
# ------------------------------------------------------------------
echo "[3/9] Creating GCP service account: ${SERVICE_ACCOUNT}..."
gcloud iam service-accounts create "sf-backup-${CLIENT_SLUG}" \
  --display-name="SF Backup - ${CLIENT_SLUG}" \
  --project="${GCP_PROJECT}" || echo "      (already exists)"

# Grant required IAM roles
for ROLE in "roles/secretmanager.secretAccessor" "roles/logging.logWriter" "roles/run.invoker"; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="${ROLE}" \
    --condition=None \
    --quiet
done

# ------------------------------------------------------------------
# 4. Generate service account JSON key
# ------------------------------------------------------------------
echo "[4/9] Generating service account key..."
SA_KEY_FILE="${KEY_DIR}/sa-key.json"
gcloud iam service-accounts keys create "${SA_KEY_FILE}" \
  --iam-account="${SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT}"

# ------------------------------------------------------------------
# 5. Store secrets in Secret Manager
# ------------------------------------------------------------------
echo "[5/9] Storing secrets in GCP Secret Manager..."

_store_secret() {
  local secret_id="$1"
  local value_file="$2"
  gcloud secrets describe "${secret_id}" --project="${GCP_PROJECT}" &>/dev/null \
    && gcloud secrets versions add "${secret_id}" --data-file="${value_file}" --project="${GCP_PROJECT}" \
    || gcloud secrets create "${secret_id}" --data-file="${value_file}" --project="${GCP_PROJECT}" \
         --replication-policy="automatic"
}

echo -n "${CONSUMER_KEY}"   > "${KEY_DIR}/consumer_key.txt"
echo -n "${SF_USERNAME}"    > "${KEY_DIR}/username.txt"
echo -n "${INSTANCE_URL}"   > "${KEY_DIR}/instance_url.txt"

_store_secret "sf-${CLIENT_SLUG}-private-key"   "${KEY_DIR}/private.pem"
_store_secret "sf-${CLIENT_SLUG}-consumer-key"  "${KEY_DIR}/consumer_key.txt"
_store_secret "sf-${CLIENT_SLUG}-username"       "${KEY_DIR}/username.txt"
_store_secret "sf-${CLIENT_SLUG}-instance-url"   "${KEY_DIR}/instance_url.txt"
_store_secret "gcp-${CLIENT_SLUG}-sa-json"       "${SA_KEY_FILE}"

# ------------------------------------------------------------------
# 6. Create client config
# ------------------------------------------------------------------
echo "[6/9] Creating client config file..."
CONFIG_FILE="clients/${CLIENT_SLUG}-config.json"
cat > "${CONFIG_FILE}" <<CONFIG
{
  "client_slug": "${CLIENT_SLUG}",
  "client_name": "${CLIENT_SLUG}",
  "sf_username": "${SF_USERNAME}",
  "sf_api_version": "59.0",
  "sf_environment": "production",
  "backup": {
    "data": {
      "enabled": true,
      "schedule_cron": "0 2 * * *",
      "schedule_timezone": "America/Chicago",
      "incremental": true,
      "object_exclusions": [],
      "object_inclusions": []
    },
    "metadata": {
      "enabled": true,
      "schedule_cron": "0 3 * * 0",
      "schedule_timezone": "America/Chicago",
      "metadata_type_exclusions": []
    },
    "files": {
      "enabled": false,
      "schedule_cron": "0 4 * * 0",
      "max_file_size_mb": 500,
      "storage_backend": "drive"
    }
  },
  "retention_days": 90,
  "drive": {
    "root_folder_id": "${DRIVE_FOLDER_ID}",
    "storage_backend": "drive"
  },
  "notifications": {
    "alert_emails": ["${NOTIFICATION_EMAIL}", "makini-ops@makiniconsulting.com"],
    "notify_on": ["failure", "success", "partial"]
  },
  "gcp": {
    "project_id": "${GCP_PROJECT}",
    "region": "us-central1",
    "cloud_run_job": "sf-backup-${CLIENT_SLUG}"
  }
}
CONFIG
echo "      Config written: ${CONFIG_FILE}"

# ------------------------------------------------------------------
# 7. Test connection
# ------------------------------------------------------------------
echo "[7/9] Testing Salesforce + Drive connection..."
GCP_PROJECT_ID="${GCP_PROJECT}" CLIENT_SLUG="${CLIENT_SLUG}" \
  python3 scripts/test_connection.py

# ------------------------------------------------------------------
# 8. Build & deploy Docker image
# ------------------------------------------------------------------
echo "[8/9] Building and pushing Docker image..."
IMAGE="us-central1-docker.pkg.dev/${GCP_PROJECT}/sf-backup/backup-runner:latest"
gcloud builds submit --tag "${IMAGE}" --project="${GCP_PROJECT}" .

# Deploy Cloud Run data job
gcloud run jobs create "sf-backup-${CLIENT_SLUG}-data" \
  --image="${IMAGE}" \
  --region="us-central1" \
  --project="${GCP_PROJECT}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --max-retries=3 \
  --task-timeout=3600 \
  --set-env-vars="CLIENT_SLUG=${CLIENT_SLUG},BACKUP_MODE=data,GCP_PROJECT_ID=${GCP_PROJECT},SF_API_VERSION=59.0,NOTIFICATION_EMAILS=${NOTIFICATION_EMAIL},RETENTION_DAYS=90,LOG_LEVEL=INFO" \
  || echo "      (job may already exist — update instead)"

# ------------------------------------------------------------------
# 9. Create Cloud Scheduler triggers
# ------------------------------------------------------------------
echo "[9/9] Creating Cloud Scheduler trigger (data)..."
gcloud scheduler jobs create http "sf-backup-${CLIENT_SLUG}-data" \
  --location="us-central1" \
  --schedule="0 2 * * *" \
  --time-zone="America/Chicago" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCP_PROJECT}/jobs/sf-backup-${CLIENT_SLUG}-data:run" \
  --http-method=POST \
  --oauth-service-account-email="${SERVICE_ACCOUNT}" \
  --project="${GCP_PROJECT}" \
  || echo "      (scheduler job may already exist)"

# ------------------------------------------------------------------
# Cleanup temp key files
# ------------------------------------------------------------------
echo ""
echo "Cleaning up temporary key files..."
rm -rf "${KEY_DIR}"

echo ""
echo "============================================================"
echo " Onboarding complete for: ${CLIENT_SLUG}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Verify Drive folder: https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}"
echo "  2. Run first manual backup:"
echo "     gcloud run jobs execute sf-backup-${CLIENT_SLUG}-data --region=us-central1 --project=${GCP_PROJECT}"
echo "  3. Monitor logs: gcloud logging read 'resource.type=cloud_run_job' --project=${GCP_PROJECT}"
echo ""
