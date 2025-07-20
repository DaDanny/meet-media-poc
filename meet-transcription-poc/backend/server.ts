import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TranscriptionService } from './api/transcription-service';
import { initializeDatabase } from './services/database';
import { 
  authenticateToken, 
  optionalAuth, 
  getGoogleAuthUrl, 
  exchangeGoogleCode, 
  refreshUserToken 
} from './middleware/auth';

// Initialize database first
console.log('🔧 Initializing Firestore database...');
initializeDatabase();

// Initialize Express app
const app = express();
const server = createServer(app);

// Initialize services
const transcriptionService = new TranscriptionService();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      transcription: 'ready'
    }
  });
});

// ===================  AUTHENTICATION ROUTES  ===================

// Get Google OAuth URL
app.get('/auth/google/url', (req, res) => {
  try {
    const authUrl = getGoogleAuthUrl();
    res.json({ 
      success: true, 
      authUrl,
      message: 'Google OAuth URL generated successfully'
    });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate OAuth URL' 
    });
  }
});

// Handle Google OAuth callback
app.post('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'OAuth code is required'
      });
    }

    const { user, token } = await exchangeGoogleCode(code);
    
    res.json({
      success: true,
      user,
      token,
      message: 'Authentication successful'
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to authenticate with Google',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Refresh JWT token
app.post('/auth/refresh', authenticateToken, async (req, res) => {
  try {
    const currentToken = req.headers.authorization?.split(' ')[1];
    if (!currentToken) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const newToken = await refreshUserToken(currentToken);
    
    res.json({
      success: true,
      token: newToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

// Get current user info
app.get('/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    message: 'User information retrieved successfully'
  });
});

// Logout (client-side token removal)
app.post('/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// ===================  TRANSCRIPTION ROUTES  ===================

// Start transcription session
app.post('/api/transcription/start', authenticateToken, async (req, res) => {
  try {
    const { meetingSpaceId, numberOfVideoStreams, enableAudioStreams, accessToken, cloudProjectNumber } = req.body;
    
    if (!meetingSpaceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Meeting space ID is required' 
      });
    }

    const sessionId = await transcriptionService.startTranscription({
      meetingSpaceId,
      numberOfVideoStreams: numberOfVideoStreams || 0,
      enableAudioStreams: enableAudioStreams !== false,
      accessToken: accessToken || 'demo-token',
      cloudProjectNumber: cloudProjectNumber || process.env.GOOGLE_CLOUD_PROJECT_ID || 'demo-project'
    }, req.userId!);

    res.json({ 
      success: true, 
      sessionId,
      message: 'Transcription started successfully'
    });

  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start transcription',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stop transcription session
app.post('/api/transcription/stop/:sessionId', authenticateToken, async (req, res) => {
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
      success: false, 
      error: 'Failed to stop transcription',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get transcription session status
app.get('/api/transcription/status/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionStatus = await transcriptionService.getSessionStatus(sessionId);
    
    res.json({ 
      success: true, 
      data: sessionStatus,
      message: 'Session status retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(404).json({ 
      success: false, 
      error: 'Session not found',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===================  USER DATA ROUTES  ===================

// Get user's meetings
app.get('/api/meetings', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const result = await transcriptionService.getUserMeetings(req.userId!, page, limit);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting user meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meetings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get recent meetings
app.get('/api/meetings/recent', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await transcriptionService.getUserMeetings(req.userId!, 1, limit);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting recent meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent meetings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get dashboard statistics
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await transcriptionService.getUserDashboardStats(req.userId!);
    
    res.json({
      success: true,
      data: stats,
      message: 'Dashboard statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🔧 INTEGRATION POINT: API routes for custom functionality

// Export transcript in different formats
app.get('/api/transcription/export/:sessionId/:format?', authenticateToken, async (req, res) => {
  try {
    const { sessionId, format = 'txt' } = req.params;
    
    if (!['txt', 'json', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use txt, json, or pdf' });
    }
    
    const filePath = await transcriptionService.exportTranscript(sessionId, format as 'txt' | 'json' | 'pdf');
    
    res.json({ 
      success: true, 
      filePath,
      downloadUrl: `/api/transcription/download/${sessionId}/${format}`
    });

  } catch (error) {
    console.error('Error exporting transcript:', error);
    res.status(500).json({ 
      error: 'Failed to export transcript',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Download transcript file
app.get('/api/transcription/download/:sessionId/:format', authenticateToken, async (req, res) => {
  try {
    const { sessionId, format } = req.params;
    const filePath = await transcriptionService.exportTranscript(sessionId, format as 'txt' | 'json' | 'pdf');
    
    // Set appropriate headers for download
    res.download(filePath, `meeting-transcript-${sessionId}.${format}`);

  } catch (error) {
    console.error('Error downloading transcript:', error);
    res.status(404).json({ error: 'Transcript file not found' });
  }
});

// Get current AI summary
app.get('/api/ai/summary/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const summary = await transcriptionService.getCurrentSummary(sessionId);
    
    res.json({ 
      success: true, 
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ 
      error: 'Failed to get summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Ask a question to the AI bot
app.post('/api/ai/question/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { question, askedBy } = req.body;
    
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required and must be a string' });
    }
    
    const answer = await transcriptionService.askQuestion(sessionId, question, askedBy || req.user?.name);
    
    res.json({ 
      success: true, 
      question,
      answer,
      askedBy: askedBy || req.user?.name || 'API User',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({ 
      error: 'Failed to process question',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get meeting insights (action items, decisions, etc.)
app.get('/api/ai/insights/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get session status with AI insights
    const sessionStatus = await transcriptionService.getSessionStatus(sessionId);
    
    const insights = {
      actionItems: [], // These would come from your Gemini processor
      keyDecisions: [], // These would come from your Gemini processor
      participants: sessionStatus.participants,
      meetingDuration: sessionStatus.endTime 
        ? Math.round((sessionStatus.endTime.getTime() - sessionStatus.startTime.getTime()) / 60000)
        : Math.round((new Date().getTime() - sessionStatus.startTime.getTime()) / 60000),
      summary: await transcriptionService.getCurrentSummary(sessionId),
      aiSettings: (sessionStatus as any).aiSettings
    };
    
    res.json({ 
      success: true, 
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting insights:', error);
    res.status(500).json({ 
      error: 'Failed to get meeting insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Toggle AI features on/off
app.post('/api/ai/settings/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { enableSummary, enableQA, enableFileExport, autoResponseEnabled } = req.body;
    
    // Update AI settings via the transcription service
    await transcriptionService.updateAISettings(sessionId, { 
      enableSummary: enableSummary !== undefined ? enableSummary : undefined,
      enableQA: enableQA !== undefined ? enableQA : undefined,
      enableFileExport: enableFileExport !== undefined ? enableFileExport : undefined,
      autoResponseEnabled: autoResponseEnabled !== undefined ? autoResponseEnabled : undefined
    });
    
    res.json({ 
      success: true, 
      message: 'AI settings updated',
      settings: { enableSummary, enableQA, enableFileExport, autoResponseEnabled }
    });

  } catch (error) {
    console.error('Error updating AI settings:', error);
    res.status(500).json({ 
      error: 'Failed to update AI settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current AI settings
app.get('/api/ai/settings/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionStatus = await transcriptionService.getSessionStatus(sessionId);
    
    res.json({ 
      success: true, 
      settings: (sessionStatus as any).aiSettings || {},
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting AI settings:', error);
    res.status(500).json({ 
      error: 'Failed to get AI settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===================  WEBSOCKET SERVER  ===================

// WebSocket server for real-time communication
const wsServer = new WebSocketServer({ port: 3001 });

wsServer.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Add client to transcription service
  transcriptionService.addClient(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('WebSocket message received:', data);
      
      // Handle client messages here if needed
      
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    transcriptionService.removeClient(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    transcriptionService.removeClient(ws);
  });
});

// ===================  ERROR HANDLING  ===================

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `${req.method} ${req.originalUrl} not found`
  });
});

// ===================  SERVER STARTUP  ===================

const PORT = process.env.PORT || 3000;

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  
  // Close WebSocket server
  wsServer.close();
  
  // Shutdown transcription service
  await transcriptionService.shutdown();
  
  // Close HTTP server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, () => {
  console.log(`
🚀 Meet Transcription Server Started!

📡 HTTP Server: http://localhost:${PORT}
🔌 WebSocket Server: ws://localhost:3001
💾 Database: Firestore (Initialized)
🔐 Authentication: Google OAuth + JWT
🤖 AI Features: Ready

API Endpoints:
📍 Health: GET /health
🔑 Auth: GET /auth/google/url, POST /auth/google/callback
📝 Transcription: POST /api/transcription/start
👥 Meetings: GET /api/meetings
📊 Dashboard: GET /api/dashboard/stats
🤖 AI: POST /api/ai/question/:sessionId

Ready for your POC! 🎉
  `);
});

export default app; 