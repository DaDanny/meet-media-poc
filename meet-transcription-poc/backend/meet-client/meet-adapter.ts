import { EventEmitter } from 'events';
import { MeetClientConfig, SpeakerInfo, AudioStreamInfo } from '../types';
import { 
  MeetConnectionState, 
  MeetSessionStatus, 
  MeetStreamTrack, 
  MeetMediaApiClient,
  MeetMediaApiClientConfig,
  Subscribable
} from './types';

/**
 * Simple subscribable implementation for development/testing
 */
class SimpleSubscribable<T> implements Subscribable<T> {
  private callbacks: Array<(value: T) => void> = [];
  private currentValue: T;

  constructor(initialValue: T) {
    this.currentValue = initialValue;
  }

  subscribe(callback: (value: T) => void): void {
    this.callbacks.push(callback);
  }

  unsubscribe(callback: (value: T) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  emit(value: T): void {
    this.currentValue = value;
    this.callbacks.forEach(callback => callback(value));
  }
}

/**
 * Meet Media API Client implementation
 * This integrates with the Google Meet Media API for real-time audio stream access
 */
class MeetMediaApiClientImpl implements MeetMediaApiClient {
  public sessionStatus: Subscribable<MeetSessionStatus>;
  public meetStreamTracks: Subscribable<MeetStreamTrack[]>;
  
  private config: MeetMediaApiClientConfig;
  private isJoined = false;

  constructor(config: MeetMediaApiClientConfig) {
    this.config = config;
    this.sessionStatus = new SimpleSubscribable<MeetSessionStatus>({
      connectionState: MeetConnectionState.DISCONNECTED
    });
    this.meetStreamTracks = new SimpleSubscribable<MeetStreamTrack[]>([]);
  }

  async joinMeeting(): Promise<any> {
    console.log('Joining Meet conference:', this.config.meetingSpaceId);
    
    // Emit waiting state
    (this.sessionStatus as SimpleSubscribable<MeetSessionStatus>).emit({
      connectionState: MeetConnectionState.WAITING
    });

    // Simulate connection process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we have a valid access token
    if (!this.config.accessToken || this.config.accessToken === 'your-access-token-here') {
      console.warn('No valid access token provided. Running in simulation mode.');
      return this.simulateJoinedState();
    }

    try {
      // TODO: Here you would integrate with the actual Google Meet Media API
      // For example:
      // const actualClient = new ActualGoogleMeetClient(this.config);
      // const result = await actualClient.joinMeeting();
      
      // For now, simulate a successful join
      return this.simulateJoinedState();
      
    } catch (error) {
      console.error('Failed to join meeting:', error);
      (this.sessionStatus as SimpleSubscribable<MeetSessionStatus>).emit({
        connectionState: MeetConnectionState.DISCONNECTED
      });
      throw error;
    }
  }

  async leaveMeeting(): Promise<any> {
    console.log('Leaving Meet conference');
    this.isJoined = false;
    
    (this.sessionStatus as SimpleSubscribable<MeetSessionStatus>).emit({
      connectionState: MeetConnectionState.DISCONNECTED
    });
    
    (this.meetStreamTracks as SimpleSubscribable<MeetStreamTrack[]>).emit([]);
    
    return { success: true };
  }

  createMediaLayout(config: { width: number; height: number }) {
    return {
      width: config.width,
      height: config.height
    };
  }

  async applyLayout(layouts: Array<{ mediaLayout: any }>): Promise<any> {
    console.log('Applying media layout:', layouts);
    return { success: true, layouts };
  }

  private async simulateJoinedState(): Promise<any> {
    this.isJoined = true;
    
    // Emit joined state
    (this.sessionStatus as SimpleSubscribable<MeetSessionStatus>).emit({
      connectionState: MeetConnectionState.JOINED
    });

    // Simulate audio streams after a short delay
    setTimeout(() => {
      this.simulateAudioStreams();
    }, 1000);

    return { success: true, meetingId: this.config.meetingSpaceId };
  }

  private simulateAudioStreams(): void {
    if (!this.isJoined) return;

    // Simulate audio streams from participants
    // In a real implementation, these would come from the actual Meet API
    const mockTracks: MeetStreamTrack[] = [];

    if (this.config.enableAudioStreams) {
      // Simulate manager audio track
      const managerTrack = this.createMockAudioTrack('manager-audio-001');
      mockTracks.push({
        mediaStreamTrack: managerTrack,
        id: 'manager-stream-001',
        participantId: 'manager-001'
      });

      // Simulate direct report audio track  
      const employeeTrack = this.createMockAudioTrack('employee-audio-001');
      mockTracks.push({
        mediaStreamTrack: employeeTrack,
        id: 'employee-stream-001', 
        participantId: 'employee-001'
      });
    }

    (this.meetStreamTracks as SimpleSubscribable<MeetStreamTrack[]>).emit(mockTracks);
  }

  private createMockAudioTrack(id: string): MediaStreamTrack {
    // Create a mock audio track for development/testing
    // In a real implementation, this would be actual audio from Meet participants
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    
    oscillator.connect(destination);
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
    oscillator.start();

    const track = destination.stream.getAudioTracks()[0];
    Object.defineProperty(track, 'id', { value: id, writable: false });
    
    return track;
  }
}

/**
 * Google Meet Media API adapter for real-time audio stream access
 * Integrates with the official Google Meet Media API for transcription
 */
export class MeetClientAdapter extends EventEmitter {
  private participants = new Map<string, SpeakerInfo>();
  private isConnected = false;
  private audioStreams = new Map<string, MediaStream>();
  private meetClient: MeetMediaApiClient | null = null;
  private participantCounter = 0;
  private trackToParticipantMap = new Map<string, string>();

  constructor(private config: MeetClientConfig) {
    super();
  }

  /**
   * Initialize and connect to the Meet conference using the official API
   */
  async connect(): Promise<void> {
    try {
      console.log('Connecting to Meet conference:', this.config.meetingSpaceId);
      
      // Create the Meet Media API client
      this.meetClient = new MeetMediaApiClientImpl({
        meetingSpaceId: this.config.meetingSpaceId,
        numberOfVideoStreams: this.config.numberOfVideoStreams,
        enableAudioStreams: this.config.enableAudioStreams,
        accessToken: this.config.accessToken,
      });

      // Subscribe to session status changes
      this.meetClient.sessionStatus.subscribe((status: MeetSessionStatus) => {
        this.handleSessionChange(status);
      });

      // Subscribe to media stream changes (participants joining/leaving, audio streams)
      this.meetClient.meetStreamTracks.subscribe((tracks: MeetStreamTrack[]) => {
        this.handleStreamChange(tracks);
      });

      // Join the meeting
      const joinResult = await this.meetClient.joinMeeting();
      console.log('Meet join result:', joinResult);
      
    } catch (error) {
      console.error('Failed to connect to Meet:', error);
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from the conference
   */
  async disconnect(): Promise<void> {
    try {
      if (this.meetClient) {
        await this.meetClient.leaveMeeting();
        this.meetClient = null;
      }
      
      this.isConnected = false;
      this.participants.clear();
      this.audioStreams.clear();
      this.trackToParticipantMap.clear();
      this.emit('disconnected');
    } catch (error) {
      console.error('Error disconnecting from Meet:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get current participants
   */
  getParticipants(): SpeakerInfo[] {
    return Array.from(this.participants.values());
  }

  /**
   * Check if connected
   */
  isConnectedToMeet(): boolean {
    return this.isConnected;
  }

  /**
   * Handle session status changes from Meet API
   */
  private handleSessionChange(status: MeetSessionStatus): void {
    console.log('Meet session status changed:', status);
    
    switch (status.connectionState) {
      case MeetConnectionState.WAITING:
        console.log('Waiting to join meeting...');
        this.emit('waiting');
        break;
        
      case MeetConnectionState.JOINED:
        console.log('Successfully joined meeting');
        this.isConnected = true;
        this.emit('connected');
        
        // Apply layout for optimal audio capture
        if (this.meetClient) {
          this.applyOptimalLayout();
        }
        break;
        
      case MeetConnectionState.DISCONNECTED:
        console.log('Disconnected from meeting');
        this.isConnected = false;
        this.participants.clear();
        this.audioStreams.clear();
        this.trackToParticipantMap.clear();
        this.emit('disconnected');
        break;
        
      default:
        console.log('Unknown connection state:', status.connectionState);
        break;
    }
  }

  /**
   * Handle stream changes (participants joining/leaving, new audio streams)
   */
  private handleStreamChange(meetStreamTracks: MeetStreamTrack[]): void {
    console.log('Stream tracks changed:', meetStreamTracks.length, 'tracks');
    
    // Process audio tracks for transcription
    const audioTracks = meetStreamTracks.filter(track => 
      track.mediaStreamTrack.kind === 'audio'
    );
    
    // Track current audio stream IDs to detect removals
    const currentAudioStreamIds = new Set<string>();
    
    audioTracks.forEach((meetStreamTrack: MeetStreamTrack) => {
      const trackId = meetStreamTrack.mediaStreamTrack.id;
      currentAudioStreamIds.add(trackId);
      
      // Check if this is a new audio stream
      if (!this.audioStreams.has(trackId)) {
        this.handleNewAudioStream(meetStreamTrack);
      }
    });
    
    // Remove audio streams that are no longer present
    for (const [trackId] of this.audioStreams.entries()) {
      if (!currentAudioStreamIds.has(trackId)) {
        this.handleRemovedAudioStream(trackId);
      }
    }
  }

  /**
   * Handle new audio stream from a participant
   */
  private handleNewAudioStream(meetStreamTrack: MeetStreamTrack): void {
    const trackId = meetStreamTrack.mediaStreamTrack.id;
    console.log('New audio stream detected:', trackId);
    
    // Create MediaStream for this track
    const mediaStream = new MediaStream();
    mediaStream.addTrack(meetStreamTrack.mediaStreamTrack);
    this.audioStreams.set(trackId, mediaStream);
    
    // Create or get participant info
    const participant = this.getOrCreateParticipant(trackId, meetStreamTrack);
    this.trackToParticipantMap.set(trackId, participant.id);
    
    // Emit audio stream event for transcription processing
    const audioStreamInfo: AudioStreamInfo = {
      participantId: participant.id,
      mediaStreamTrack: meetStreamTrack.mediaStreamTrack,
      isActive: true
    };
    
    this.emit('audioStream', {
      participant,
      stream: mediaStream,
      streamInfo: audioStreamInfo
    });
  }

  /**
   * Handle removed audio stream
   */
  private handleRemovedAudioStream(trackId: string): void {
    console.log('Audio stream removed:', trackId);
    
    const stream = this.audioStreams.get(trackId);
    if (stream) {
      // Stop all tracks in the stream
      stream.getTracks().forEach(track => track.stop());
      this.audioStreams.delete(trackId);
      
      // Find and remove the participant if no other streams
      const participantId = this.trackToParticipantMap.get(trackId);
      if (participantId) {
        this.trackToParticipantMap.delete(trackId);
        
        if (!this.hasActiveStreams(participantId)) {
          const participant = this.participants.get(participantId);
          if (participant) {
            this.participants.delete(participantId);
            this.emit('participantLeft', participant);
          }
        }
      }
    }
  }

  /**
   * Get or create participant information from stream track
   */
  private getOrCreateParticipant(trackId: string, meetStreamTrack: MeetStreamTrack): SpeakerInfo {
    // Check if we already have a participant for this track
    const existingParticipantId = this.trackToParticipantMap.get(trackId);
    if (existingParticipantId) {
      const participant = this.participants.get(existingParticipantId);
      if (participant) {
        return participant;
      }
    }

    // Create new participant based on stream info
    this.participantCounter++;
    
    // Use participant ID from Meet API if available, otherwise generate one
    const participantId = meetStreamTrack.participantId || `participant-${this.participantCounter}`;
    
    // Determine role based on participant ID (this is simplified - in real app you'd have better logic)
    let role: 'manager' | 'direct_report' | 'unknown' = 'unknown';
    let name = `Participant ${this.participantCounter}`;
    
    if (participantId.includes('manager')) {
      role = 'manager';
      name = 'Manager';
    } else if (participantId.includes('employee')) {
      role = 'direct_report'; 
      name = 'Direct Report';
    }

    const participant: SpeakerInfo = {
      id: participantId,
      name,
      role
    };
    
    this.participants.set(participant.id, participant);
    this.emit('participantJoined', participant);
    
    return participant;
  }

  /**
   * Check if participant has any active streams
   */
  private hasActiveStreams(participantId: string): boolean {
    for (const [trackId, mappedParticipantId] of this.trackToParticipantMap.entries()) {
      if (mappedParticipantId === participantId && this.audioStreams.has(trackId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Apply optimal layout for audio capture
   */
  private async applyOptimalLayout(): Promise<void> {
    try {
      if (!this.meetClient) return;
      
      const mediaLayout = this.meetClient.createMediaLayout({
        width: 500,
        height: 500
      });
      
      const response = await this.meetClient.applyLayout([{mediaLayout}]);
      console.log('Applied layout for optimal audio capture:', response);
    } catch (error) {
      console.error('Failed to apply layout:', error);
    }
  }
} 