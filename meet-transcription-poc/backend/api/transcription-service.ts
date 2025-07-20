import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { AudioTranscriptionProcessor } from '../transcription/audio-processor';
import { MeetClientAdapter } from '../meet-client/meet-adapter';
import { databaseService } from '../services/database';
import {
  MeetClientConfig,
  TranscriptionSession,
  TranscriptLine,
  Participant,
  TranscriptionServiceError,
  WebSocketMessage,
  TranscriptMessage,
  SessionUpdateMessage,
  ConnectionStatusMessage,
  AIResponseMessage,
  AISummaryMessage,
  VoiceCommandDetectedMessage,
  AISettings,
  Meeting,
  AIResponse
} from '../types';

// 🔧 INTEGRATION POINT: Import your custom plugins here
import { TranscriptFileManager } from '../plugins/file-manager';
import { GeminiAIProcessor } from '../plugins/gemini-processor';
import { MeetingQABot } from '../plugins/qa-bot';

export class TranscriptionService extends EventEmitter {
  private activeSessions = new Map<string, TranscriptionSession>();
  private meetClients = new Map<string, MeetClientAdapter>();
  private audioProcessors = new Map<string, AudioTranscriptionProcessor>();
  private connectedClients = new Set<WebSocket>();
  private sessionToMeetingMap = new Map<string, string>(); // sessionId -> meetingId

  // 🔧 INTEGRATION POINT: Add your custom plugin instances
  private fileManager: TranscriptFileManager;
  private geminiProcessor: GeminiAIProcessor;
  private qaBot: MeetingQABot;
  
  // 🔧 AI Bot settings per session
  private aiSettings = new Map<string, AISettings>();

  constructor() {
    super();
    
    // 🔧 INTEGRATION POINT: Initialize your custom plugins
    this.fileManager = new TranscriptFileManager('./transcripts');
    this.geminiProcessor = new GeminiAIProcessor();
    this.qaBot = new MeetingQABot();
    
    console.log('🤖 TranscriptionService initialized with AI plugins and Firestore database');
  }

  /**
   * Start transcription for a new meeting
   */
  async startTranscription(config: MeetClientConfig, userId: string): Promise<string> {
    const sessionId = uuidv4();
    
    try {
      // 🔧 DATABASE: Create meeting record in Firestore
      const meeting = await databaseService.createMeeting({
        meetingSpaceId: config.meetingSpaceId,
        title: `Meeting ${new Date().toLocaleDateString()}`,
        ownerId: userId,
        participants: []
      });

      // Map session to meeting
      this.sessionToMeetingMap.set(sessionId, meeting.id);

      // Create transcription session
      const session: TranscriptionSession = {
        id: sessionId,
        meetingId: meeting.id,
        participants: [],
        startTime: new Date(),
        status: 'active',
        transcriptLines: [],
        totalLines: 0,
        userId: userId,
        aiSettings: {
          enableQA: false,
          enableSummary: false,
          enableFileExport: true,
          voiceCommands: ['hey ai', 'ai bot', 'ai summary', 'ai action items'],
          autoResponseEnabled: false
        }
      };

      this.activeSessions.set(sessionId, session);
      this.aiSettings.set(sessionId, session.aiSettings);

      // 🔧 INTEGRATION POINT: Initialize session-specific resources
      await this.fileManager.initializeSession(sessionId, session);
      await this.geminiProcessor.startMeetingSummary(sessionId, session);
      await this.qaBot.initializeForMeeting(sessionId, session);

      // Initialize audio processor
      const audioProcessor = new AudioTranscriptionProcessor({
        languageCode: process.env.SPEECH_LANGUAGE_CODE || 'en-US',
        enableSpeakerDiarization: process.env.ENABLE_SPEAKER_DIARIZATION === 'true',
        diarizationSpeakerCount: parseInt(process.env.DIARIZATION_SPEAKER_COUNT || '2')
      });

      this.audioProcessors.set(sessionId, audioProcessor);

      // Set up audio processor event listeners
      this.setupAudioProcessorListeners(audioProcessor, sessionId);

      // Initialize Meet client
      const meetClient = new MeetClientAdapter(config);
      this.meetClients.set(sessionId, meetClient);

      // Set up Meet client event listeners
      this.setupMeetClientListeners(meetClient, sessionId, audioProcessor);

      // Connect to Meet
      await meetClient.connect();

      console.log(`Started transcription session ${sessionId} for meeting ${config.meetingSpaceId}`);
      
      // Notify connected clients about the new session
      this.broadcastMessage({
        type: 'session_update',
        payload: {
          participants: session.participants,
          status: session.status,
          sessionId: sessionId,
          aiSettings: session.aiSettings
        },
        timestamp: new Date()
      } as SessionUpdateMessage);

      return sessionId;

    } catch (error) {
      console.error(`Failed to start transcription session: ${error}`);
      this.activeSessions.delete(sessionId);
      this.sessionToMeetingMap.delete(sessionId);
      throw new TranscriptionServiceError(
        'SESSION_START_ERROR',
        'Failed to start transcription session',
        error
      );
    }
  }

  /**
   * Stop transcription for a session
   */
  async stopTranscription(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new TranscriptionServiceError(
        'SESSION_NOT_FOUND',
        `Transcription session ${sessionId} not found`
      );
    }

    try {
      console.log(`Stopping transcription session ${sessionId}`);

      // 🔧 DATABASE: End meeting in Firestore
      const meetingId = this.sessionToMeetingMap.get(sessionId);
      if (meetingId) {
        await databaseService.endMeeting(meetingId);
      }

      // Stop Meet client
      const meetClient = this.meetClients.get(sessionId);
      if (meetClient) {
        await meetClient.disconnect();
      }

      // Stop audio processor
      const audioProcessor = this.audioProcessors.get(sessionId);
      if (audioProcessor) {
        audioProcessor.stopAllTranscription();
      }

      // Update session status
      session.endTime = new Date();
      session.status = 'ended';

      // 🔧 INTEGRATION POINT: Finalize custom processing
      await this.fileManager.finalizeSession(sessionId);
      const summary = await this.geminiProcessor.generateFinalSummary(sessionId);
      await this.qaBot.endMeeting(sessionId);

      // Clean up resources
      this.cleanupSession(sessionId);

      console.log(`Transcription session ${sessionId} stopped successfully`);

    } catch (error) {
      console.error(`Error stopping transcription session ${sessionId}:`, error);
      throw new TranscriptionServiceError(
        'SESSION_STOP_ERROR',
        'Failed to stop transcription session',
        error
      );
    }
  }

  /**
   * Get session status and additional info
   */
  async getSessionStatus(sessionId: string): Promise<TranscriptionSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new TranscriptionServiceError(
        'SESSION_NOT_FOUND',
        `Transcription session ${sessionId} not found`
      );
    }

    // 🔧 DATABASE: Get meeting data from Firestore
    const meetingId = this.sessionToMeetingMap.get(sessionId);
    let meeting = null;
    if (meetingId) {
      meeting = await databaseService.getMeeting(meetingId);
    }

    // 🔧 INTEGRATION POINT: Add custom session data
    const customData = {
      meeting: meeting,
      fileLocation: await this.fileManager.getFileLocation(sessionId),
      currentSummary: await this.geminiProcessor.getCurrentSummary(sessionId),
      qaStatus: await this.qaBot.getStatus(sessionId),
      aiSettings: this.aiSettings.get(sessionId)
    };

    return { ...session, ...customData } as any;
  }

  // 🔧 AI Bot management methods
  /**
   * Update AI settings for a session
   */
  async updateAISettings(sessionId: string, settings: Partial<AISettings>): Promise<void> {
    const currentSettings = this.aiSettings.get(sessionId);
    if (!currentSettings) {
      throw new TranscriptionServiceError('SESSION_NOT_FOUND', `Session ${sessionId} not found`);
    }

    const updatedSettings = { ...currentSettings, ...settings };
    this.aiSettings.set(sessionId, updatedSettings);

    // Update session object
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.aiSettings = updatedSettings;
    }

    console.log(`🤖 Updated AI settings for session ${sessionId}:`, updatedSettings);

    // Notify connected clients about settings change
    this.broadcastMessage({
      type: 'session_update',
      payload: {
        participants: session?.participants || [],
        status: session?.status || 'active',
        sessionId,
        aiSettings: updatedSettings
      },
      timestamp: new Date()
    } as any);
  }

  /**
   * Check if text contains a voice command
   */
  private containsVoiceCommand(text: string, sessionId: string): { command: string; cleanText: string } | null {
    const settings = this.aiSettings.get(sessionId);
    if (!settings || !settings.enableQA) {
      return null;
    }

    const lowerText = text.toLowerCase();
    const foundCommand = settings.voiceCommands.find(cmd => lowerText.includes(cmd));
    
    if (foundCommand) {
      // Extract the question part after the command
      const commandIndex = lowerText.indexOf(foundCommand);
      const cleanText = text.substring(commandIndex + foundCommand.length).trim();
      return { command: foundCommand, cleanText: cleanText || text };
    }

    return null;
  }

  // 🔧 INTEGRATION POINT: Add custom API endpoints
  /**
   * Process a question during the meeting using AI
   */
  async askQuestion(sessionId: string, question: string, askedBy: string = 'API User'): Promise<string> {
    const settings = this.aiSettings.get(sessionId);
    if (!settings?.enableQA) {
      return 'AI Q&A is currently disabled for this session.';
    }

    try {
      const answer = await this.qaBot.processQuestion(sessionId, question, askedBy);
      
      // 🔧 DATABASE: Save AI response to Firestore
      const meetingId = this.sessionToMeetingMap.get(sessionId);
      if (meetingId) {
        const aiResponse: AIResponse = {
          id: uuidv4(),
          question,
          answer,
          askedBy,
          triggerType: 'manual',
          timestamp: new Date(),
          meetingId
        };
        
        await databaseService.saveAIResponse(meetingId, aiResponse);
      }

      // Broadcast the AI response to all clients
      this.broadcastMessage({
        type: 'ai_response',
        payload: {
          id: uuidv4(),
          question,
          answer,
          askedBy,
          triggerType: 'manual',
          timestamp: new Date(),
          meetingId: meetingId || ''
        },
        timestamp: new Date()
      } as AIResponseMessage);

      return answer;
    } catch (error) {
      console.error('Error processing question:', error);
      return 'Sorry, I encountered an error processing your question.';
    }
  }

  /**
   * Get current meeting summary
   */
  async getCurrentSummary(sessionId: string): Promise<string> {
    const settings = this.aiSettings.get(sessionId);
    if (!settings?.enableSummary) {
      return 'AI summarization is currently disabled for this session.';
    }

    return await this.geminiProcessor.getCurrentSummary(sessionId);
  }

  /**
   * Export transcript as file
   */
  async exportTranscript(sessionId: string, format: 'txt' | 'json' | 'pdf' = 'txt'): Promise<string> {
    const settings = this.aiSettings.get(sessionId);
    if (!settings?.enableFileExport) {
      throw new Error('File export is currently disabled for this session.');
    }

    return await this.fileManager.exportTranscript(sessionId, format);
  }

  // 🔧 DATABASE: Methods for accessing user data
  /**
   * Get user's meetings from database
   */
  async getUserMeetings(userId: string, page: number = 1, limit: number = 20): Promise<any> {
    const result = await databaseService.getUserMeetings(userId, limit);
    return {
      success: true,
      data: result.meetings,
      pagination: {
        page,
        limit,
        hasMore: result.hasMore,
        total: result.meetings.length // Note: This is not the actual total, just current page size
      }
    };
  }

  /**
   * Get user dashboard statistics
   */
  async getUserDashboardStats(userId: string): Promise<any> {
    return await databaseService.getUserDashboardStats(userId);
  }

  /**
   * Add a WebSocket client for real-time updates
   */
  addClient(ws: WebSocket): void {
    this.connectedClients.add(ws);
    
    // Send current session status to new client
    const activeSessions = Array.from(this.activeSessions.values());
    if (activeSessions.length > 0) {
      const currentSession = activeSessions[0]; // For POC, we handle one session at a time
      this.sendToClient(ws, {
        type: 'session_update',
        payload: {
          participants: currentSession.participants,
          status: currentSession.status,
          sessionId: currentSession.id,
          aiSettings: currentSession.aiSettings
        },
        timestamp: new Date()
      } as SessionUpdateMessage);
    }
  }

  /**
   * Remove a WebSocket client
   */
  removeClient(ws: WebSocket): void {
    this.connectedClients.delete(ws);
  }

  /**
   * Shutdown all active sessions
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down transcription service...');
    
    const sessionIds = Array.from(this.activeSessions.keys());
    await Promise.all(sessionIds.map(id => this.stopTranscription(id)));
    
    this.connectedClients.clear();
    this.aiSettings.clear();
    this.sessionToMeetingMap.clear();
    console.log('Transcription service shutdown complete');
  }

  /**
   * Set up event listeners for audio processor
   */
  private setupAudioProcessorListeners(
    audioProcessor: AudioTranscriptionProcessor, 
    sessionId: string
  ): void {
    audioProcessor.on('transcript', async (transcriptLine: TranscriptLine) => {
      console.log(`[${sessionId}] Transcript: ${transcriptLine.speaker.name}: ${transcriptLine.text}`);
      
      const meetingId = this.sessionToMeetingMap.get(sessionId);
      if (meetingId) {
        transcriptLine.meetingId = meetingId;
      }
      
      // 🔧 INTEGRATION POINT: Process each transcript line with custom functionality
      try {
        // 🔧 DATABASE: Save transcript to Firestore
        if (meetingId && transcriptLine.isFinal) {
          await databaseService.saveTranscriptLine(meetingId, transcriptLine);
        }

        // 1. Save to file
        await this.fileManager.appendTranscriptLine(sessionId, transcriptLine);
        
        // 2. Process with Gemini AI for ongoing summary
        if (transcriptLine.isFinal) {
          await this.geminiProcessor.processTranscriptLine(sessionId, transcriptLine);
          
          // Update QA bot context
          this.qaBot.updateContext(sessionId, transcriptLine);
        }
        
        // 3. Check if it's a voice command for the AI bot
        if (transcriptLine.isFinal) {
          const voiceCommand = this.containsVoiceCommand(transcriptLine.text, sessionId);
          if (voiceCommand) {
            await this.handleVoiceCommand(sessionId, transcriptLine, voiceCommand);
          }
        }
        
      } catch (error) {
        console.error(`Error processing transcript line: ${error}`);
      }
      
      // Broadcast transcript to all connected clients
      this.broadcastMessage({
        type: 'transcript',
        payload: transcriptLine,
        timestamp: new Date()
      } as TranscriptMessage);
    });

    audioProcessor.on('error', (error: TranscriptionServiceError) => {
      console.error(`[${sessionId}] Audio processor error:`, error);
      
      // Broadcast error to clients
      this.broadcastMessage({
        type: 'error',
        payload: {
          code: error.code,
          message: error.message,
          sessionId
        },
        timestamp: new Date()
      });
    });
  }

  /**
   * Handle voice command detection and processing
   */
  private async handleVoiceCommand(
    sessionId: string, 
    transcriptLine: TranscriptLine, 
    voiceCommand: { command: string; cleanText: string }
  ): Promise<void> {
    try {
      console.log(`🎤 Voice command detected: "${voiceCommand.command}" from ${transcriptLine.speaker.name}`);

      // Notify clients that a voice command was detected
      this.broadcastMessage({
        type: 'voice_command_detected',
        payload: {
          command: voiceCommand.command,
          speaker: transcriptLine.speaker,
          originalText: transcriptLine.text,
          timestamp: new Date()
        },
        timestamp: new Date()
      } as VoiceCommandDetectedMessage);

      // Process the command based on type
      let question = voiceCommand.cleanText;
      let answer: string;

      if (voiceCommand.command.includes('summary')) {
        question = 'Please provide a summary of our discussion so far.';
        answer = await this.geminiProcessor.getCurrentSummary(sessionId);
      } else if (voiceCommand.command.includes('action items')) {
        question = 'What are the action items from our discussion?';
        const actionItems = await this.geminiProcessor.extractActionItems(sessionId);
        answer = actionItems.length > 0 
          ? `Here are the action items: ${actionItems.join(', ')}`
          : 'No specific action items have been identified yet.';
      } else {
        // General AI question
        if (!question) {
          question = 'Can you help me with this meeting?';
        }
        answer = await this.qaBot.processQuestion(sessionId, question, transcriptLine.speaker.name);
      }

      // 🔧 DATABASE: Save AI response to Firestore
      const meetingId = this.sessionToMeetingMap.get(sessionId);
      if (meetingId) {
        const aiResponse: AIResponse = {
          id: uuidv4(),
          question,
          answer,
          askedBy: transcriptLine.speaker.name,
          triggerType: 'voice_command',
          timestamp: new Date(),
          meetingId
        };
        
        await databaseService.saveAIResponse(meetingId, aiResponse);
      }

      // Broadcast the AI response
      this.broadcastMessage({
        type: 'ai_response',
        payload: {
          id: uuidv4(),
          question,
          answer,
          askedBy: transcriptLine.speaker.name,
          triggerType: 'voice_command',
          timestamp: new Date(),
          meetingId: meetingId || ''
        },
        timestamp: new Date()
      } as AIResponseMessage);

    } catch (error) {
      console.error(`Error handling voice command: ${error}`);
      
      // Send error response
      this.broadcastMessage({
        type: 'ai_response',
        payload: {
          id: uuidv4(),
          question: voiceCommand.cleanText,
          answer: 'Sorry, I had trouble processing that voice command. Please try again.',
          askedBy: transcriptLine.speaker.name,
          triggerType: 'voice_command',
          timestamp: new Date(),
          meetingId: this.sessionToMeetingMap.get(sessionId) || ''
        },
        timestamp: new Date()
      } as AIResponseMessage);
    }
  }

  /**
   * Set up event listeners for Meet client
   */
  private setupMeetClientListeners(
    meetClient: MeetClientAdapter,
    sessionId: string,
    audioProcessor: AudioTranscriptionProcessor
  ): void {
    meetClient.on('connected', () => {
      console.log(`[${sessionId}] Successfully joined Meet conference`);
      
      this.broadcastMessage({
        type: 'connection_status',
        payload: {
          status: 'connected',
          meetConnectionState: 'JOINED'
        },
        timestamp: new Date()
      } as ConnectionStatusMessage);
    });

    meetClient.on('audioStream', async (data: any) => {
      console.log(`[${sessionId}] New audio stream for ${data.participant.name}`);
      
      try {
        // Start processing audio for transcription
        const meetingId = this.sessionToMeetingMap.get(sessionId) || 'unknown';
        await audioProcessor.processAudioTrack(data.streamInfo, data.participant, meetingId);
      } catch (error) {
        console.error(`[${sessionId}] Failed to process audio stream:`, error);
      }
    });

    meetClient.on('participantJoined', async (participant: Participant) => {
      console.log(`[${sessionId}] Participant joined: ${participant.name}`);
      
      // Update session participants
      const session = this.activeSessions.get(sessionId);
      if (session) {
        const existingIndex = session.participants.findIndex(p => p.id === participant.id);
        if (existingIndex === -1) {
          session.participants.push(participant);
        }

        // 🔧 DATABASE: Update meeting participants in Firestore
        const meetingId = this.sessionToMeetingMap.get(sessionId);
        if (meetingId) {
          await databaseService.updateMeeting(meetingId, {
            participants: session.participants
          });
        }
        
        // Broadcast participant update
        this.broadcastMessage({
          type: 'session_update',
          payload: {
            participants: session.participants,
            status: session.status,
            sessionId,
            aiSettings: session.aiSettings
          },
          timestamp: new Date()
        } as SessionUpdateMessage);
      }
    });

    meetClient.on('participantLeft', async (participant: Participant) => {
      console.log(`[${sessionId}] Participant left: ${participant.name}`);
      
      // Update session participants
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.participants = session.participants.filter(p => p.id !== participant.id);

        // 🔧 DATABASE: Update meeting participants in Firestore
        const meetingId = this.sessionToMeetingMap.get(sessionId);
        if (meetingId) {
          await databaseService.updateMeeting(meetingId, {
            participants: session.participants
          });
        }
        
        // Broadcast participant update
        this.broadcastMessage({
          type: 'session_update',
          payload: {
            participants: session.participants,
            status: session.status,
            sessionId,
            aiSettings: session.aiSettings
          },
          timestamp: new Date()
        } as SessionUpdateMessage);
      }
    });

    meetClient.on('disconnected', (reason?: any) => {
      console.log(`[${sessionId}] Disconnected from Meet conference:`, reason);
      
      this.broadcastMessage({
        type: 'connection_status',
        payload: {
          status: 'disconnected',
          meetConnectionState: 'DISCONNECTED'
        },
        timestamp: new Date()
      } as ConnectionStatusMessage);
    });

    meetClient.on('error', (error: Error) => {
      console.error(`[${sessionId}] Meet client error:`, error);
      
      this.broadcastMessage({
        type: 'error',
        payload: {
          code: 'MEET_CLIENT_ERROR',
          message: error.message,
          sessionId
        },
        timestamp: new Date()
      });
    });
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  private broadcastMessage(message: WebSocketMessage): void {
    const messageString = JSON.stringify(message);
    
    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  }

  /**
   * Send message to a specific WebSocket client
   */
  private sendToClient(client: WebSocket, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Clean up session resources
   */
  private cleanupSession(sessionId: string): void {
    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    
    // Clean up AI settings
    this.aiSettings.delete(sessionId);
    
    // Clean up session to meeting mapping
    this.sessionToMeetingMap.delete(sessionId);
    
    // Clean up Meet client
    const meetClient = this.meetClients.get(sessionId);
    if (meetClient) {
      meetClient.removeAllListeners();
      this.meetClients.delete(sessionId);
    }
    
    // Clean up audio processor
    const audioProcessor = this.audioProcessors.get(sessionId);
    if (audioProcessor) {
      audioProcessor.removeAllListeners();
      this.audioProcessors.delete(sessionId);
    }
  }

  /**
   * Get active sessions (for debugging)
   */
  getActiveSessions(): TranscriptionSession[] {
    return Array.from(this.activeSessions.values());
  }

  // 🔧 INTEGRATION POINT: Add helper methods for custom functionality
  private isQuestion(text: string): boolean {
    // Simple question detection - you could make this more sophisticated
    const questionIndicators = ['?', 'what is', 'how do', 'can you', 'please explain'];
    return questionIndicators.some(indicator => text.toLowerCase().includes(indicator));
  }
} 