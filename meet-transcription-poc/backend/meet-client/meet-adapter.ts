import { EventEmitter } from 'events';
import { MeetClientConfig, SpeakerInfo } from '../types';

/**
 * Simplified adapter for Google Meet Media API integration
 * This will be connected to the actual Meet API implementation
 */
export class MeetClientAdapter extends EventEmitter {
  private participants = new Map<string, SpeakerInfo>();
  private isConnected = false;
  private audioStreams = new Map<string, MediaStream>();

  constructor(private config: MeetClientConfig) {
    super();
  }

  /**
   * Initialize and connect to the Meet conference
   */
  async connect(): Promise<void> {
    try {
      console.log('Connecting to Meet conference:', this.config.meetingSpaceId);
      
      // TODO: Integrate with actual Meet Media API
      // For now, emit a mock connection event
      this.isConnected = true;
      this.emit('connected');
      
      // Mock participants for testing
      this.addMockParticipants();
      
    } catch (error) {
      console.error('Failed to connect to Meet:', error);
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from the conference
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.participants.clear();
    this.audioStreams.clear();
    this.emit('disconnected');
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
   * Handle new audio stream from a participant
   */
  private handleAudioStream(participantId: string, stream: MediaStream): void {
    this.audioStreams.set(participantId, stream);
    
    const participant = this.participants.get(participantId);
    if (participant) {
      this.emit('audioStream', {
        participant,
        stream
      });
    }
  }

  /**
   * Add mock participants for testing
   * TODO: Replace with actual Meet API participant detection
   */
  private addMockParticipants(): void {
    const manager: SpeakerInfo = {
      id: 'manager-001',
      name: 'Manager Smith',
      role: 'manager'
    };

    const directReport: SpeakerInfo = {
      id: 'employee-001', 
      name: 'Employee Jones',
      role: 'direct_report'
    };

    this.participants.set(manager.id, manager);
    this.participants.set(directReport.id, directReport);

    this.emit('participantJoined', manager);
    this.emit('participantJoined', directReport);
  }

  /**
   * Handle participant leaving
   */
  private handleParticipantLeft(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      this.participants.delete(participantId);
      this.audioStreams.delete(participantId);
      this.emit('participantLeft', participant);
    }
  }
} 