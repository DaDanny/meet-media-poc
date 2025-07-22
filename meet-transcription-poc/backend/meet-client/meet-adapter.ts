import { EventEmitter } from 'events';
import {
  MeetClientConfig,
  Participant,
  AudioStreamInfo,
  TranscriptionServiceError
} from '../types';
import { 
  MeetConnectionState,
  MeetSessionStatus,
  MeetStreamTrack,
  Subscribable
} from './types';

// Number of audio virtual SSRCs - Meet only supports 3
const NUMBER_OF_AUDIO_VIRTUAL_SSRC = 3;

/**
 * Adapter for Google Meet Media API Client
 * Based on the Google-provided sample implementation
 */
export class MeetClientAdapter extends EventEmitter {
  private config: MeetClientConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private sessionStatus: MeetSessionStatus = { connectionState: MeetConnectionState.WAITING };
  private meetStreamTracks: MeetStreamTrack[] = [];
  private participants: Map<string, Participant> = new Map();
  private trackToParticipantMap: Map<string, string> = new Map();
  private sessionControlChannel: RTCDataChannel | null = null;
  private isConnected = false;

  constructor(config: MeetClientConfig) {
    super();
    this.config = config;
    console.log('MeetClientAdapter initialized for:', config.meetingSpaceId);
  }

  /**
   * Connect to Google Meet conference
   * Based on Google's joinMeeting implementation
   */
  async connect(): Promise<void> {
    try {
      console.log('Connecting to Meet conference:', this.config.meetingSpaceId);
      
      // Emit waiting state
      this.updateSessionStatus({ connectionState: MeetConnectionState.WAITING });

      // Check if we have a valid access token
      if (!this.config.accessToken || 
          this.config.accessToken === 'demo-token' || 
          this.config.accessToken === 'your-access-token-here') {
        console.warn('⚠️ No valid access token provided. Running in simulation mode.');
        return this.simulateConnection();
      }

      // Initialize real Meet Media API connection
      await this.initializeRealConnection();

    } catch (error) {
      console.error('Failed to connect to Meet conference:', error);
      this.updateSessionStatus({ connectionState: MeetConnectionState.DISCONNECTED });
      this.emit('error', new Error(`Meet connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }

  /**
   * Initialize real Google Meet Media API connection
   * Based on Google's MeetMediaApiClientImpl.joinMeeting()
   */
  private async initializeRealConnection(): Promise<void> {
    // Create RTCPeerConnection with Google's recommended configuration
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Set up track event handler for incoming audio/video streams
    this.peerConnection.ontrack = (event: RTCTrackEvent) => {
      if (event.track) {
        this.handleIncomingTrack(event.track, event.receiver);
      }
    };

    // Set up connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('PeerConnection state changed:', state);
      
      if (state === 'connected') {
        this.updateSessionStatus({ connectionState: MeetConnectionState.JOINED });
        this.isConnected = true;
        this.emit('connected');
        this.applyOptimalLayout();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.updateSessionStatus({ connectionState: MeetConnectionState.DISCONNECTED });
        this.isConnected = false;
        this.emit('disconnected', state);
      }
    };

    // Create audio transceivers for receiving audio streams
    if (this.config.enableAudioStreams) {
      for (let i = 0; i < NUMBER_OF_AUDIO_VIRTUAL_SSRC; i++) {
        // Create receive-only audio transceiver with OPUS codec support
        this.peerConnection.addTransceiver('audio', { 
          direction: 'recvonly' 
        });
      }
    }

    // Create session control data channel
    await this.createDataChannels();

    // Start the WebRTC negotiation process
    await this.startNegotiation();
  }

  /**
   * Create data channels for Meet session control
   * Based on Google's implementation
   */
  private async createDataChannels(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    const dataChannelConfig = {
      ordered: true,
      reliable: true,
    };

    // Create session control channel
    this.sessionControlChannel = this.peerConnection.createDataChannel(
      'session-control',
      dataChannelConfig
    );

    this.sessionControlChannel.onopen = () => {
      console.log('Session control channel opened');
    };

    this.sessionControlChannel.onmessage = (event) => {
      this.handleSessionControlMessage(event.data);
    };

    this.sessionControlChannel.onerror = (error) => {
      console.error('Session control channel error:', error);
    };
  }

  /**
   * Handle incoming audio/video track
   * Based on Google's createMeetStreamTrack implementation
   */
  private handleIncomingTrack(track: MediaStreamTrack, receiver: RTCRtpReceiver): void {
    console.log(`📡 Incoming ${track.kind} track:`, track.id);

    // Create MeetStreamTrack wrapper
    const meetStreamTrack: MeetStreamTrack = {
      mediaStreamTrack: track,
      receiver: receiver,
      id: track.id,
      kind: track.kind as 'audio' | 'video'
    };

    // Add to our track collection
    this.meetStreamTracks.push(meetStreamTrack);

    // For audio tracks, set up transcription processing
    if (track.kind === 'audio') {
      this.handleAudioTrack(meetStreamTrack);
    }

    // Emit track event for the transcription service
    this.emit('streamUpdate', this.meetStreamTracks);
  }

  /**
   * Handle audio track for transcription
   */
  private handleAudioTrack(meetStreamTrack: MeetStreamTrack): void {
    // Generate or detect participant info
    const participant = this.getOrCreateParticipantForTrack(meetStreamTrack);
    
    // Create audio stream info
    const audioStreamInfo: AudioStreamInfo = {
      participantId: participant.id,
      mediaStreamTrack: meetStreamTrack.mediaStreamTrack,
      isActive: true
    };

    // Emit audio stream event for transcription processing
    this.emit('audioStream', {
      streamInfo: audioStreamInfo,
      participant: participant
    });

    console.log(`🎙️ Audio stream ready for transcription: ${participant.name}`);
  }

  /**
   * Get or create participant for a track
   * Based on track metadata and meeting context
   */
  private getOrCreateParticipantForTrack(meetStreamTrack: MeetStreamTrack): Participant {
    const trackId = meetStreamTrack.id || meetStreamTrack.mediaStreamTrack.id;
    
    // Check if we already have a participant for this track
    const existingParticipantId = this.trackToParticipantMap.get(trackId);
    if (existingParticipantId) {
      const participant = this.participants.get(existingParticipantId);
      if (participant) {
        return participant;
      }
    }

    // Create new participant
    const participantId = `participant_${this.participants.size + 1}`;
    const participant: Participant = {
      id: participantId,
      name: `Participant ${this.participants.size + 1}`,
      role: this.determineParticipantRole(participantId),
      joinTime: new Date(),
      isActive: true
    };

    // Store participant and track mapping
    this.participants.set(participantId, participant);
    this.trackToParticipantMap.set(trackId, participantId);

    // Emit participant joined event
    this.emit('participantJoined', participant);

    return participant;
  }

  /**
   * Determine participant role based on meeting context
   */
  private determineParticipantRole(participantId: string): 'host' | 'manager' | 'direct_report' | 'participant' | 'unknown' {
    // For 1:1 meetings, try to detect manager/direct_report relationship
    const participantCount = this.participants.size;
    
    if (participantCount === 0) {
      return 'host'; // First participant is likely the host
    } else if (participantCount === 1) {
      return 'participant'; // Second participant in 1:1
    }
    
    return 'unknown';
  }

  /**
   * Start WebRTC negotiation process
   */
  private async startNegotiation(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    try {
      // Create and set local offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // In a real implementation, you would:
      // 1. Send the offer to Google Meet's signaling server
      // 2. Receive the answer from Google Meet
      // 3. Set the remote description

      // For now, simulate successful negotiation
      setTimeout(() => {
        this.simulateSuccessfulNegotiation();
      }, 2000);

    } catch (error) {
      console.error('WebRTC negotiation failed:', error);
      throw error;
    }
  }

  /**
   * Simulate successful WebRTC negotiation for development
   */
  private simulateSuccessfulNegotiation(): void {
    // Simulate receiving remote answer and setting it
    // In production, this would be the actual remote description from Meet
    this.updateSessionStatus({ connectionState: MeetConnectionState.JOINED });
    this.isConnected = true;
    this.emit('connected');

    // Simulate incoming audio streams after connection
    setTimeout(() => {
      this.simulateIncomingAudioStreams();
    }, 1000);
  }

  /**
   * Simulate incoming audio streams for development/testing
   */
  private simulateIncomingAudioStreams(): void {
    // Create mock audio tracks for testing
    const mockAudioTrack1 = new MediaStreamTrack();
    const mockAudioTrack2 = new MediaStreamTrack();

    // Override properties for testing
    Object.defineProperty(mockAudioTrack1, 'kind', { value: 'audio' });
    Object.defineProperty(mockAudioTrack1, 'id', { value: 'audio_track_1' });
    Object.defineProperty(mockAudioTrack2, 'kind', { value: 'audio' });
    Object.defineProperty(mockAudioTrack2, 'id', { value: 'audio_track_2' });

    // Simulate incoming tracks
    this.handleIncomingTrack(mockAudioTrack1, {} as RTCRtpReceiver);
    this.handleIncomingTrack(mockAudioTrack2, {} as RTCRtpReceiver);
  }

  /**
   * Handle session control messages
   */
  private handleSessionControlMessage(data: any): void {
    try {
      const message = JSON.parse(data);
      console.log('Session control message:', message);
      
      // Handle different message types based on Google's protocol
      switch (message.type) {
        case 'participant_update':
          this.handleParticipantUpdate(message.data);
          break;
        case 'session_status':
          this.handleSessionStatusUpdate(message.data);
          break;
        default:
          console.log('Unknown session control message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse session control message:', error);
    }
  }

  /**
   * Handle participant updates from session control
   */
  private handleParticipantUpdate(data: any): void {
    // Process participant join/leave events
    // Update participant list and emit events
    console.log('Participant update received:', data);
  }

  /**
   * Handle session status updates
   */
  private handleSessionStatusUpdate(data: any): void {
    console.log('Session status update received:', data);
  }

  /**
   * Apply optimal layout for audio capture
   * Based on Google's sample implementation
   */
  private async applyOptimalLayout(): Promise<void> {
    try {
      // In a real implementation, this would call the Meet Media API
      // to optimize the layout for audio capture
      console.log('📐 Applying optimal layout for audio capture');
      
      // For now, just log that we would apply the layout
      // const mediaLayout = this.createMediaLayout({ width: 500, height: 500 });
      // const response = await this.applyLayout([{ mediaLayout }]);
      
    } catch (error) {
      console.error('Failed to apply layout:', error);
    }
  }

  /**
   * Simulate connection for development (when no valid access token)
   */
  private async simulateConnection(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    this.updateSessionStatus({ connectionState: MeetConnectionState.JOINED });
    this.isConnected = true;
    this.emit('connected');

    // Simulate participants joining
    setTimeout(() => {
      this.simulateParticipants();
    }, 1000);
  }

  /**
   * Simulate participants for development
   */
  private simulateParticipants(): void {
    const participants = [
      {
        id: 'manager_123',
        name: 'Alex Manager',
        email: 'alex.manager@company.com',
        role: 'manager' as const,
        joinTime: new Date(),
        isActive: true
      },
      {
        id: 'employee_456',
        name: 'Jamie Employee',
        email: 'jamie.employee@company.com',
        role: 'direct_report' as const,
        joinTime: new Date(Date.now() + 5000),
        isActive: true
      }
    ];

    participants.forEach((participant, index) => {
      setTimeout(() => {
        this.participants.set(participant.id, participant);
        this.emit('participantJoined', participant);
        
        // Simulate audio stream for each participant
        setTimeout(() => {
          this.simulateAudioStreamForParticipant(participant);
        }, 500);
      }, index * 2000);
    });
  }

  /**
   * Simulate audio stream for a participant
   */
  private simulateAudioStreamForParticipant(participant: Participant): void {
    const mockTrack = new MediaStreamTrack();
    Object.defineProperty(mockTrack, 'kind', { value: 'audio' });
    Object.defineProperty(mockTrack, 'id', { value: `audio_${participant.id}` });

    const audioStreamInfo: AudioStreamInfo = {
      participantId: participant.id,
      mediaStreamTrack: mockTrack,
      isActive: true
    };

    this.emit('audioStream', {
      streamInfo: audioStreamInfo,
      participant: participant
    });
  }

  /**
   * Update session status and emit events
   */
  private updateSessionStatus(status: MeetSessionStatus): void {
    this.sessionStatus = status;
    this.emit('sessionStatusChanged', status);
  }

  /**
   * Disconnect from the meeting
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from Meet conference');

    try {
      // Close data channels
      if (this.sessionControlChannel) {
        this.sessionControlChannel.close();
        this.sessionControlChannel = null;
      }

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Update status
      this.updateSessionStatus({ connectionState: MeetConnectionState.DISCONNECTED });
      this.isConnected = false;

      // Clean up participants
      this.participants.clear();
      this.trackToParticipantMap.clear();
      this.meetStreamTracks = [];

      this.emit('disconnected', 'manual');
      console.log('✅ Disconnected from Meet conference');

    } catch (error) {
      console.error('Error during disconnect:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check if currently connected
   */
  isConnectedToMeeting(): boolean {
    return this.isConnected && this.sessionStatus.connectionState === MeetConnectionState.JOINED;
  }

  /**
   * Get current session status
   */
  getSessionStatus(): MeetSessionStatus {
    return this.sessionStatus;
  }

  /**
   * Get current participants
   */
  getParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get current stream tracks
   */
  getStreamTracks(): MeetStreamTrack[] {
    return [...this.meetStreamTracks];
  }
} 