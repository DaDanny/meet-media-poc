# Workload Identity Federation Setup

## Overview
Workload Identity Federation allows your application to authenticate to Google Cloud services without storing service account keys.

## Setup Steps

### 1. Create Workload Identity Pool
```bash
gcloud iam workload-identity-pools create "meet-transcription-pool" \
    --project="YOUR_PROJECT_ID" \
    --location="global" \
    --display-name="Meet Transcription Pool"
```

### 2. Create Workload Identity Provider
```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
    --project="YOUR_PROJECT_ID" \
    --location="global" \
    --workload-identity-pool="meet-transcription-pool" \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --issuer-uri="https://token.actions.githubusercontent.com"
```

### 3. Grant Service Account Access
```bash
gcloud iam service-accounts add-iam-policy-binding \
    "meet-transcription@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --project="YOUR_PROJECT_ID" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/meet-transcription-pool/attribute.repository/YOUR_GITHUB_REPO"
```

### 4. Environment Variables for Workload Identity
```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=""  # Leave empty for workload identity
WORKLOAD_IDENTITY_PROVIDER=projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/meet-transcription-pool/providers/github-provider
SERVICE_ACCOUNT_EMAIL=meet-transcription@your-project-id.iam.gserviceaccount.com
```

### 5. Application Code Changes
Your application will automatically use workload identity federation when deployed to environments that support it (like GitHub Actions, Cloud Run, etc.).

## Benefits
- ✅ No service account keys to manage
- ✅ Automatic key rotation
- ✅ Better security audit trail
- ✅ Enterprise security compliance 