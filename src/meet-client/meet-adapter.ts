import { EventEmitter } from 'events';
import { MeetClientConfig, SpeakerInfo } from '../types';
import {
  MeetMediaApiClient,
  MeetStreamTrack,
  Participant,
  MeetSessionStatus,
  MeetConnectionState,
  MediaEntry,
  MeetMediaClientRequiredConfiguration
} from './types';

/**
 * Adapter that bridges the original Meet Media API implementation
 * with our transcription POC
 */
export class MeetClientAdapter extends EventEmitter {
  private meetClient: MeetMediaApiClient | null = null;
  private participants = new Map<string, SpeakerInfo>();
  private isConnected = false;

  constructor(private config: MeetClientConfig) {
    super();
  }

  /**
   * Initialize and connect to the Meet conference
   */
  async connect(): Promise<void> {
    try {
      // Import the original Meet client implementation
      // This is a simplified approach - in practice, you'll need to integrate
      // with the actual implementation from the ../web directory
      const { MeetMediaApiClientImpl } = await this.importMeetClient();

      const meetConfig: MeetMediaClientRequiredConfiguration = {
        meetingSpaceId: this.config.meetingSpaceId,
        numberOfVideoStreams: this.config.numberOfVideoStreams,
        enableAudioStreams: this.config.enableAudioStreams,
        accessToken: this.config.accessToken
      };

      this.meetClient = new MeetMediaApiClientImpl(meetConfig);

      // Set up event listeners
      this.setupEventListeners();

      // Join the meeting
      await this.meetClient.joinMeeting();
      
      this.emit('connected');
      console.log('Successfully connected to Meet conference');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from the Meet conference
   */
  async disconnect(): Promise<void> {
    if (this.meetClient) {
      try {
        await this.meetClient.leaveMeeting();
        this.isConnected = false;
        this.participants.clear();
        this.emit('disconnected');
        console.log('Disconnected from Meet conference');
      } catch (error) {
        this.emit('error', error);
        throw error;
      }
    }
  }

  /**
   * Get current participants
   */
  getParticipants(): SpeakerInfo[] {
    return Array.from(this.participants.values());
  }

  /**
   * Check if connected to Meet
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the current connection status
   */
  getConnectionStatus(): MeetConnectionState {
    if (!this.meetClient) return MeetConnectionState.UNKNOWN;
    return this.meetClient.sessionStatus.get().connectionState;
  }

  /**
   * Set up event listeners for the Meet client
   */
  private setupEventListeners(): void {
    if (!this.meetClient) return;

    // Listen for session status changes
    this.meetClient.sessionStatus.subscribe((status: MeetSessionStatus) => {
      this.handleSessionStatusChange(status);
    });

    // Listen for audio stream changes
    this.meetClient.meetStreamTracks.subscribe((tracks: MeetStreamTrack[]) => {
      this.handleStreamTracksChange(tracks);
    });

    // Listen for participant changes
    this.meetClient.participants.subscribe((participants: Participant[]) => {
      this.handleParticipantsChange(participants);
    });

    // Listen for media entries changes (for better participant tracking)
    this.meetClient.mediaEntries.subscribe((mediaEntries: MediaEntry[]) => {
      this.handleMediaEntriesChange(mediaEntries);
    });
  }

  /**
   * Handle session status changes
   */
  private handleSessionStatusChange(status: MeetSessionStatus): void {
    console.log(`Meet session status changed: ${MeetConnectionState[status.connectionState]}`);
    
    switch (status.connectionState) {
      case MeetConnectionState.WAITING:
        this.emit('waiting');
        break;
      case MeetConnectionState.JOINED:
        this.isConnected = true;
        this.emit('joined');
        break;
      case MeetConnectionState.DISCONNECTED:
        this.isConnected = false;
        this.emit('disconnected', status.disconnectReason);
        break;
    }

    this.emit('status_change', status);
  }

  /**
   * Handle changes in audio/video stream tracks
   */
  private handleStreamTracksChange(tracks: MeetStreamTrack[]): void {
    const audioTracks = tracks.filter(track => 
      track.mediaStreamTrack.kind === 'audio'
    );

    console.log(`Received ${audioTracks.length} audio tracks`);

    // Emit audio tracks for transcription processing
    audioTracks.forEach(track => {
      const mediaEntry = track.mediaEntry.get();
      if (mediaEntry) {
        const participant = mediaEntry.participant.get();
        if (participant) {
          const speakerInfo = this.createSpeakerInfo(participant, mediaEntry);
          this.emit('audio_track', track, speakerInfo);
        }
      }
    });

    this.emit('stream_tracks_change', tracks);
  }

  /**
   * Handle participant changes
   */
  private handleParticipantsChange(participants: Participant[]): void {
    console.log(`Participants updated: ${participants.length} total`);
    
    // Update our participants map
    this.participants.clear();
    participants.forEach((participant, index) => {
      const speakerInfo: SpeakerInfo = {
        id: participant.sessionName,
        name: participant.displayName.get() || `Participant ${index + 1}`,
        role: this.determineParticipantRole(participant, index),
        csrc: undefined // Will be populated when we get media entries
      };
      this.participants.set(participant.sessionName, speakerInfo);
    });

    this.emit('participants_change', Array.from(this.participants.values()));
  }

  /**
   * Handle media entries changes for better participant tracking
   */
  private handleMediaEntriesChange(mediaEntries: MediaEntry[]): void {
    console.log(`Media entries updated: ${mediaEntries.length} entries`);
    
    // Update participant info with media entry details
    mediaEntries.forEach(entry => {
      const participant = entry.participant.get();
      if (participant && entry.sessionName) {
        const existingSpeaker = this.participants.get(participant.sessionName);
        if (existingSpeaker) {
          // Update with additional info from media entry
          this.participants.set(participant.sessionName, {
            ...existingSpeaker,
            // Add any additional metadata from media entry
          });
        }
      }
    });

    this.emit('media_entries_change', mediaEntries);
  }

  /**
   * Create speaker info from participant and media entry
   */
  private createSpeakerInfo(participant: Participant, mediaEntry?: MediaEntry): SpeakerInfo {
    const existingSpeaker = this.participants.get(participant.sessionName);
    
    return {
      id: participant.sessionName,
      name: participant.displayName.get() || existingSpeaker?.name || 'Unknown Participant',
      role: existingSpeaker?.role || 'unknown',
      csrc: undefined // This would need to be extracted from the WebRTC internals
    };
  }

  /**
   * Determine participant role for 1:1 meetings
   */
  private determineParticipantRole(participant: Participant, index: number): 'manager' | 'direct_report' | 'unknown' {
    const displayName = participant.displayName.get() || '';
    const user = participant.user.get();
    
    // Simple heuristics for role detection
    if (displayName.toLowerCase().includes('manager') || 
        displayName.toLowerCase().includes('lead') ||
        displayName.toLowerCase().includes('supervisor')) {
      return 'manager';
    }
    
    // For 1:1 meetings, first participant could be the meeting organizer (manager)
    if (index === 0) {
      return 'manager';
    }
    
    return 'direct_report';
  }

  /**
   * Import the Meet client implementation
   * This is a placeholder - you'll need to adapt this to import from the actual location
   */
  private async importMeetClient(): Promise<any> {
    // In a real implementation, you would import from the web directory
    // For now, this is a placeholder that would need to be adapted
    
    // Example of how you might import the actual implementation:
    // const { MeetMediaApiClientImpl } = await import('../../web/internal/meetmediaapiclient_impl');
    
    // For the POC, we'll need to create a bridge or use the existing sample
    throw new Error('Meet client import not implemented - needs integration with existing web implementation');
  }
} 