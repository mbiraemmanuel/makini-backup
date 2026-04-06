FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Salesforce CLI (sf v2)
RUN npm install -g @salesforce/cli

# Set working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY clients/ ./clients/

# Environment variables (non-secret; overridden at Cloud Run deploy time)
ENV CLIENT_SLUG=""
ENV SF_API_VERSION="59.0"
ENV BACKUP_MODE="full"
ENV RETENTION_DAYS="90"
ENV NOTIFICATION_EMAILS=""
ENV GCP_PROJECT_ID=""
ENV LOG_LEVEL="INFO"

# Entry point
ENTRYPOINT ["python", "src/main.py"]
