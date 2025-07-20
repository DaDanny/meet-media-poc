import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { AudioTranscriptionProcessor } from '../transcription/audio-processor';
import { MeetClientAdapter } from '../meet-client/meet-adapter';
import {
  MeetClientConfig,
  TranscriptionSession,
  TranscriptLine,
  SpeakerInfo,
  TranscriptionServiceError,
  WebSocketMessage,
  TranscriptMessage,
  SessionUpdateMessage,
  ConnectionStatusMessage
} from '../types';

export class TranscriptionService extends EventEmitter {
  private activeSessions = new Map<string, TranscriptionSession>();
  private meetClients = new Map<string, MeetClientAdapter>();
  private audioProcessors = new Map<string, AudioTranscriptionProcessor>();
  private connectedClients = new Set<WebSocket>();

  constructor() {
    super();
  }

  /**
   * Start transcription for a new meeting
   */
  async startTranscription(config: MeetClientConfig): Promise<string> {
    const sessionId = uuidv4();
    
    try {
      // Create transcription session
      const session: TranscriptionSession = {
        id: sessionId,
        meetingId: config.meetingSpaceId,
        participants: [],
        startTime: new Date(),
        status: 'active'
      };

      this.activeSessions.set(sessionId, session);

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
          status: session.status
        },
        timestamp: new Date()
      } as SessionUpdateMessage);

      return sessionId;

    } catch (error) {
      // Clean up on failure
      this.cleanupSession(sessionId);
      
      throw new TranscriptionServiceError(
        'SESSION_START_FAILED',
        `Failed to start transcription session: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      // Update session status
      session.status = 'ended';
      session.endTime = new Date();

      // Disconnect from Meet
      const meetClient = this.meetClients.get(sessionId);
      if (meetClient) {
        await meetClient.disconnect();
      }

      // Stop audio processing
      const audioProcessor = this.audioProcessors.get(sessionId);
      if (audioProcessor) {
        audioProcessor.stopAllTranscription();
      }

      // Clean up resources
      this.cleanupSession(sessionId);

      console.log(`Stopped transcription session ${sessionId}`);

      // Notify connected clients
      this.broadcastMessage({
        type: 'session_update',
        payload: {
          participants: [],
          status: 'ended'
        },
        timestamp: new Date()
      } as SessionUpdateMessage);

    } catch (error) {
      throw new TranscriptionServiceError(
        'SESSION_STOP_FAILED',
        `Failed to stop transcription session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<TranscriptionSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new TranscriptionServiceError(
        'SESSION_NOT_FOUND',
        `Transcription session ${sessionId} not found`
      );
    }

    return { ...session };
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
          status: currentSession.status
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
    console.log('Transcription service shutdown complete');
  }

  /**
   * Set up event listeners for audio processor
   */
  private setupAudioProcessorListeners(
    audioProcessor: AudioTranscriptionProcessor, 
    sessionId: string
  ): void {
    audioProcessor.on('transcript', (transcriptLine: TranscriptLine) => {
      console.log(`[${sessionId}] Transcript: ${transcriptLine.speaker.name}: ${transcriptLine.text}`);
      
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
   * Set up event listeners for Meet client
   */
  private setupMeetClientListeners(
    meetClient: MeetClientAdapter,
    sessionId: string,
    audioProcessor: AudioTranscriptionProcessor
  ): void {
    meetClient.on('joined', () => {
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

    meetClient.on('audio_track', async (track: any, speakerInfo: SpeakerInfo) => {
      console.log(`[${sessionId}] New audio track for ${speakerInfo.name}`);
      
      try {
        // Start processing audio for transcription
        await audioProcessor.processAudioTrack(track, speakerInfo);
      } catch (error) {
        console.error(`[${sessionId}] Failed to process audio track:`, error);
      }
    });

    meetClient.on('participants_change', (participants: SpeakerInfo[]) => {
      console.log(`[${sessionId}] Participants updated: ${participants.length} total`);
      
      // Update session participants
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.participants = participants;
      }

      // Broadcast participant update
      this.broadcastMessage({
        type: 'session_update',
        payload: {
          participants,
          status: session?.status || 'active'
        },
        timestamp: new Date()
      } as SessionUpdateMessage);
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
} 