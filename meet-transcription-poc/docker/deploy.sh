#!/bin/bash

# Google Cloud Run Deployment Script for Meet Transcription POC
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

set -e

# Configuration
PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"us-central1"}
SERVICE_NAME="meet-transcription-poc"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Meet Transcription POC to Cloud Run"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo ""

# Verify gcloud is configured
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ No active gcloud authentication found. Please run 'gcloud auth login'"
    exit 1
fi

# Set the project
echo "📋 Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com \
                       run.googleapis.com \
                       speech.googleapis.com \
                       secretmanager.googleapis.com

# Build the image using Cloud Build
echo "🏗️  Building container image..."
gcloud builds submit --tag ${IMAGE_NAME} .

# Create secrets (if they don't exist)
echo "🔐 Setting up secrets..."

# Check if secrets exist, create if not
if ! gcloud secrets describe meet-oauth-credentials >/dev/null 2>&1; then
    echo "Creating meet-oauth-credentials secret..."
    echo -n "your-client-id" | gcloud secrets create meet-oauth-credentials --data-file=-
    echo "⚠️  Please update the meet-oauth-credentials secret with your actual OAuth credentials"
fi

if ! gcloud secrets describe session-secret >/dev/null 2>&1; then
    echo "Creating session-secret..."
    openssl rand -base64 32 | gcloud secrets create session-secret --data-file=-
fi

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}" \
    --set-secrets="MEET_OAUTH_CLIENT_ID=meet-oauth-credentials:latest" \
    --set-secrets="MEET_OAUTH_CLIENT_SECRET=meet-oauth-credentials:latest" \
    --set-secrets="SESSION_SECRET=session-secret:latest" \
    --memory 2Gi \
    --cpu 1 \
    --timeout 900 \
    --concurrency 10 \
    --min-instances 0 \
    --max-instances 10

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""
echo "📋 Next steps:"
echo "   1. Update OAuth redirect URIs to include: ${SERVICE_URL}/auth/callback"
echo "   2. Update meet-oauth-credentials secret with actual values:"
echo "      gcloud secrets versions add meet-oauth-credentials --data-file=credentials.json"
echo "   3. Test the service at: ${SERVICE_URL}"
echo "" 