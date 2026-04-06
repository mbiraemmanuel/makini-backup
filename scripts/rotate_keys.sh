#!/usr/bin/env bash
# =============================================================================
# rotate_keys.sh — Annual RSA key pair rotation for a client
# =============================================================================
# Usage:
#   ./scripts/rotate_keys.sh <client-slug> <gcp-project-id>
#
# What this does:
#   1. Generates a new RSA 2048-bit key pair + self-signed certificate (365 days)
#   2. Prints the new certificate.pem so you can upload it to the Salesforce Connected App
#   3. After confirmation, stores the new private key in Secret Manager
#   4. The old version is kept in Secret Manager (audit trail), but disabled
# =============================================================================
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <client-slug> <gcp-project-id>"
  exit 1
fi

CLIENT_SLUG="$1"
GCP_PROJECT="$2"
KEY_DIR="$(mktemp -d)"

echo ""
echo "============================================================"
echo " SF Backup — Key Rotation: ${CLIENT_SLUG}"
echo "============================================================"
echo ""

# 1. Generate new key pair
echo "[1/4] Generating new RSA key pair..."
openssl genrsa -out "${KEY_DIR}/private.pem" 2048
openssl req -new -x509 \
  -key "${KEY_DIR}/private.pem" \
  -out "${KEY_DIR}/certificate.pem" \
  -days 365 \
  -subj "/CN=${CLIENT_SLUG}-sf-backup-$(date +%Y)"

echo ""
echo "  New certificate (upload this to Salesforce Connected App > Digital Certificates):"
echo "  ---------------------------------------------------------------------------------"
cat "${KEY_DIR}/certificate.pem"
echo "  ---------------------------------------------------------------------------------"
echo ""
echo "  >>> Upload the certificate above to your Salesforce Connected App,"
echo "      then press Enter to store the new private key in Secret Manager."
read -r

# 2. Disable old secret version (keeps history, removes access)
echo "[2/4] Disabling previous private key version in Secret Manager..."
LATEST_VERSION=$(gcloud secrets versions list "sf-${CLIENT_SLUG}-private-key" \
  --project="${GCP_PROJECT}" \
  --filter="state=ENABLED" \
  --format="value(name)" \
  | sort -t/ -k6 -n | tail -1)

if [[ -n "${LATEST_VERSION}" ]]; then
  gcloud secrets versions disable "${LATEST_VERSION}" \
    --secret="sf-${CLIENT_SLUG}-private-key" \
    --project="${GCP_PROJECT}"
  echo "      Disabled: ${LATEST_VERSION}"
fi

# 3. Add new key version
echo "[3/4] Storing new private key in Secret Manager..."
gcloud secrets versions add "sf-${CLIENT_SLUG}-private-key" \
  --data-file="${KEY_DIR}/private.pem" \
  --project="${GCP_PROJECT}"
echo "      New version stored."

# 4. Cleanup
echo "[4/4] Cleaning up temporary files..."
rm -rf "${KEY_DIR}"

echo ""
echo "Key rotation complete for: ${CLIENT_SLUG}"
echo ""
echo "IMPORTANT: Run a test backup to confirm the new key works:"
echo "  gcloud run jobs execute sf-backup-${CLIENT_SLUG}-data --region=us-central1 --project=${GCP_PROJECT}"
echo ""
