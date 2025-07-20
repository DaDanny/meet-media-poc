import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { TranscriptionService } from './api/transcription-service';
import { AuthManager } from './utils/auth-manager';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 8080;
const wsPort = process.env.WS_PORT || 8081;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('web'));

// Initialize services
const authManager = new AuthManager();
const transcriptionService = new TranscriptionService();

// Create WebSocket server for real-time transcription
const wss = new WebSocketServer({ port: parseInt(wsPort.toString()) });

// Handle WebSocket connections
wss.on('connection', (ws, request) => {
  console.log('New WebSocket connection established');
  
  // Add client to transcription service
  transcriptionService.addClient(ws);
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    transcriptionService.removeClient(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Start transcription for a meeting
app.post('/api/transcription/start', async (req, res) => {
  try {
    const { meetingId, accessToken } = req.body;
    
    if (!meetingId || !accessToken) {
      return res.status(400).json({ 
        error: 'Missing required fields: meetingId and accessToken' 
      });
    }

    const sessionId = await transcriptionService.startTranscription({
      meetingSpaceId: meetingId,
      accessToken,
      numberOfVideoStreams: 0, // Only need audio for transcription
      enableAudioStreams: true,
      cloudProjectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER || ''
    });

    res.json({ 
      success: true, 
      sessionId,
      message: 'Transcription started successfully' 
    });

  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({ 
      error: 'Failed to start transcription',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stop transcription
app.post('/api/transcription/stop/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await transcriptionService.stopTranscription(sessionId);
    
    res.json({ 
      success: true, 
      message: 'Transcription stopped successfully' 
    });

  } catch (error) {
    console.error('Error stopping transcription:', error);
    res.status(500).json({ 
      error: 'Failed to stop transcription',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get transcription status
app.get('/api/transcription/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = await transcriptionService.getSessionStatus(sessionId);
    
    res.json(status);

  } catch (error) {
    console.error('Error getting transcription status:', error);
    res.status(500).json({ 
      error: 'Failed to get transcription status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OAuth endpoints for Meet API authentication
app.get('/api/auth/url', async (req, res) => {
  try {
    const authUrl = await authManager.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const tokens = await authManager.exchangeCodeForTokens(code);
    
    // In production, you'd want to store this securely and return a session token
    res.json({ 
      success: true, 
      accessToken: tokens.access_token,
      message: 'Authentication successful' 
    });

  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve the transcription dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start the server
server.listen(port, () => {
  console.log(`🚀 Transcription server running on port ${port}`);
  console.log(`📡 WebSocket server running on port ${wsPort}`);
  console.log(`🏥 Health check available at http://localhost:${port}/health`);
  console.log(`📱 Dashboard available at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  
  // Stop all active transcriptions
  await transcriptionService.shutdown();
  
  // Close WebSocket server
  wss.close();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  
  await transcriptionService.shutdown();
  wss.close();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app; 