// Google Meet Media API type definitions
// Based on the official Google Meet Media API types

export enum MeetConnectionState {
  WAITING = 'WAITING',
  JOINED = 'JOINED', 
  DISCONNECTED = 'DISCONNECTED'
}

export interface MeetSessionStatus {
  connectionState: MeetConnectionState;
}

export interface MeetStreamTrack {
  mediaStreamTrack: MediaStreamTrack;
  id?: string;
  participantId?: string;
  receiver?: RTCRtpReceiver;
  kind?: 'audio' | 'video';
}

export interface MeetMediaApiClientConfig {
  meetingSpaceId: string;
  numberOfVideoStreams: number;
  enableAudioStreams: boolean;
  accessToken: string;
}

export interface MediaLayout {
  width: number;
  height: number;
}

export interface Subscribable<T> {
  subscribe(callback: (value: T) => void): void;
  unsubscribe(callback: (value: T) => void): void;
}

export interface MeetMediaApiClient {
  sessionStatus: Subscribable<MeetSessionStatus>;
  meetStreamTracks: Subscribable<MeetStreamTrack[]>;
  
  joinMeeting(): Promise<any>;
  leaveMeeting(): Promise<any>;
  createMediaLayout(config: { width: number; height: number }): MediaLayout;
  applyLayout(layouts: Array<{ mediaLayout: MediaLayout }>): Promise<any>;
}

// WebRTC Audio types for transcription
export interface MediaStreamAudioTrack extends MediaStreamTrack {
  readonly kind: 'audio';
  clone(): MediaStreamAudioTrack;
}

export interface AudioData {
  allocationSize(): number;
  copyTo(destination: ArrayBuffer, options?: { planeIndex: number }): void;
  close(): void;
}

export interface MediaStreamTrackProcessor<T> {
  readonly readable: ReadableStream<T>;
}

declare global {
  interface Window {
    MediaStreamTrackProcessor: {
      new <T>(options: { track: MediaStreamTrack }): MediaStreamTrackProcessor<T>;
    };
  }
}

// Simplified subscribable implementation for our POC
export class SimpleSubscribable<T> implements Subscribable<T> {
  private subscribers: ((value: T) => void)[] = [];

  subscribe(callback: (value: T) => void): void {
    this.subscribers.push(callback);
  }

  unsubscribe(callback: (value: T) => void): void {
    const index = this.subscribers.indexOf(callback);
    if (index > -1) {
      this.subscribers.splice(index, 1);
    }
  }

  protected notify(value: T): void {
    this.subscribers.forEach(callback => callback(value));
  }
} 