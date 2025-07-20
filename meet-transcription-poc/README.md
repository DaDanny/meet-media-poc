# Meet Transcription POC

A real-time transcription proof-of-concept for Google Meet 1:1 meetings, built with TypeScript, Node.js, and Google Cloud services.

## 🎯 Overview

This POC demonstrates how to:
- Connect to Google Meet conferences using the Meet Media API
- Extract real-time audio streams from participants  
- Generate live transcriptions using Google Speech-to-Text
- Display transcripts in a modern web dashboard
- Identify speakers in 1:1 meetings (Manager vs Direct Report)

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Frontend  │────│   Node.js Server │────│  Google Meet    │
│   (Dashboard)   │    │   (WebSocket)    │    │   Media API     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                       ┌────────┴────────┐
                       │  Google Cloud   │
                       │  Speech-to-Text │
                       └─────────────────┘
```

## 📁 Project Structure

```
meet-transcription-poc/
├── backend/
│   ├── api/                    # REST API endpoints
│   ├── meet-client/           # Meet Media API integration
│   ├── transcription/         # Speech-to-Text processing
│   ├── types/                 # TypeScript definitions
│   ├── utils/                 # Auth and utilities
│   └── server.ts              # Main Express server
├── web/                       # Frontend dashboard
│   ├── index.html
│   ├── styles/main.css
│   └── scripts/app.js
├── docker/                    # Cloud Run deployment
│   ├── deploy.sh
│   └── cloudrun.yaml
├── Dockerfile
└── package.json
```

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Project** with the following APIs enabled:
   - Meet Media API (Developer Preview)
   - Speech-to-Text API
   - Secret Manager API

2. **OAuth2 Credentials** for Meet Media API access

3. **Node.js 18+** and npm

### Installation

1. **Clone and setup:**
   ```bash
   cd meet-transcription-poc
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Set up Google Cloud credentials:**
   ```bash
   # Download service account key
   gcloud iam service-accounts keys create credentials.json \
     --iam-account=your-service-account@your-project.iam.gserviceaccount.com
   
   export GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
   ```

4. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

5. **Open the dashboard:**
   ```
   http://localhost:8080
   ```

## 🔧 Configuration

### Environment Variables

```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PROJECT_NUMBER=123456789012
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Meet API OAuth
MEET_OAUTH_CLIENT_ID=your-client-id.googleusercontent.com
MEET_OAUTH_CLIENT_SECRET=your-client-secret

# Server
PORT=8080
NODE_ENV=development

# Transcription
SPEECH_LANGUAGE_CODE=en-US
ENABLE_SPEAKER_DIARIZATION=true
DIARIZATION_SPEAKER_COUNT=2
```

### OAuth Setup

1. **Create OAuth2 credentials** in Google Cloud Console
2. **Add authorized redirect URIs:**
   - `http://localhost:8080/auth/callback` (development)
   - `https://your-domain.com/auth/callback` (production)

## 🎮 Usage

### 1. Authentication
- Click "Authenticate with Google" 
- Complete OAuth flow in popup window
- Dashboard will enable after successful auth

### 2. Connect to Meeting
- Enter Meet Space ID (format: `spaces/abc123def456`)
- Click "Connect to Meeting"
- Wait for connection and participant detection

### 3. Live Transcription
- Real-time transcripts appear as participants speak
- Speaker identification shows Manager vs Direct Report
- Download transcripts as text files
- Clear transcript history as needed

### 4. Monitor Status
- Connection status indicator
- Session duration timer
- Participant count and status
- Audio quality indicator

## 🐳 Deployment

### Google Cloud Run

1. **Configure deployment:**
   ```bash
   cd docker
   chmod +x deploy.sh
   ```

2. **Deploy to Cloud Run:**
   ```bash
   ./deploy.sh YOUR-PROJECT-ID us-central1
   ```

3. **Update OAuth redirects** with your Cloud Run URL

### Manual Deployment

```bash
# Build container
docker build -t meet-transcription-poc .

# Deploy to your platform
docker run -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT_ID=your-project \
  -e MEET_OAUTH_CLIENT_ID=your-client-id \
  meet-transcription-poc
```

## 🧪 Development

### Available Scripts

```bash
npm run dev          # Development with hot reload
npm run build        # Build for production
npm run test         # Run tests
npm run build:web    # Build frontend only
```

### Key Components

- **`backend/server.ts`** - Express server with WebSocket support
- **`backend/meet-client/meet-adapter.ts`** - Meet Media API integration
- **`backend/transcription/audio-processor.ts`** - Speech-to-Text processing
- **`backend/api/transcription-service.ts`** - Main transcription service
- **`web/scripts/app.js`** - Frontend WebSocket client

## 🔮 Next Steps

### Phase 2 Enhancements

1. **Production Integration**
   - Replace mock Meet client with actual API calls
   - Implement proper audio stream processing
   - Add error handling and retry logic

2. **Advanced Features**
   - Meeting recording and playback
   - Transcript search and indexing
   - Meeting summaries with AI
   - Calendar integration

3. **Enterprise Features**
   - Multi-tenant support
   - Role-based access control
   - Analytics and reporting
   - API for third-party integrations

4. **Performance Optimizations**
   - Audio stream buffering
   - Transcript caching
   - Horizontal scaling
   - CDN for static assets

### Technical Improvements

- Add comprehensive testing suite
- Implement proper logging and monitoring
- Add database for transcript persistence
- Create admin dashboard
- Add webhook support for external systems

## 📚 Learn More

- [Google Meet Media API Documentation](https://developers.google.com/workspace/meet/media-api)
- [Google Speech-to-Text API](https://cloud.google.com/speech-to-text)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)

## 🐛 Troubleshooting

### Common Issues

1. **Authentication fails**
   - Check OAuth credentials
   - Verify redirect URIs
   - Ensure Meet API access

2. **Connection timeout**
   - Check network connectivity
   - Verify Meet Space ID format
   - Ensure participant permissions

3. **No transcription**
   - Check Speech-to-Text API quota
   - Verify audio stream access
   - Check microphone permissions

## 📄 License

Apache 2.0 - See LICENSE file for details 