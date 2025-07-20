// Adapted from the original Meet Media API types
export interface MeetStreamTrack {
  readonly mediaStreamTrack: MediaStreamTrack;
  readonly mediaEntry: Subscribable<MediaEntry | undefined>;
}

export interface MediaEntry {
  readonly participant: Subscribable<Participant | undefined>;
  readonly audioMuted: Subscribable<boolean>;
  readonly videoMuted: Subscribable<boolean>;
  readonly screenShare: Subscribable<boolean>;
  readonly isPresenter: Subscribable<boolean>;
  readonly audioMeetStreamTrack: Subscribable<MeetStreamTrack | undefined>;
  readonly videoMeetStreamTrack: Subscribable<MeetStreamTrack | undefined>;
  sessionName?: string;
  session?: string;
}

export interface Participant {
  readonly displayName: Subscribable<string | undefined>;
  readonly user: Subscribable<SignedInUser | AnonymousUser | PhoneUser | undefined>;
  readonly sessionName: string;
}

export interface SignedInUser {
  readonly user: string;
  readonly displayName: string;
}

export interface AnonymousUser {
  readonly displayName: string;
}

export interface PhoneUser {
  readonly displayName: string;
}

export interface Subscribable<T> {
  subscribe(callback: (value: T) => void): void;
  get(): T;
}

export interface MeetSessionStatus {
  connectionState: MeetConnectionState;
  disconnectReason?: MeetDisconnectReason;
}

export enum MeetConnectionState {
  UNKNOWN = 0,
  WAITING = 1,
  JOINED = 2,
  DISCONNECTED = 3,
}

export enum MeetDisconnectReason {
  UNKNOWN = 0,
  CLIENT_LEFT = 1,
  USER_STOPPED = 2,
  CONFERENCE_ENDED = 3,
  SESSION_UNHEALTHY = 4,
}

export interface MeetMediaApiClient {
  readonly sessionStatus: Subscribable<MeetSessionStatus>;
  readonly meetStreamTracks: Subscribable<MeetStreamTrack[]>;
  readonly mediaEntries: Subscribable<MediaEntry[]>;
  readonly participants: Subscribable<Participant[]>;
  readonly presenter: Subscribable<MediaEntry | undefined>;
  readonly screenshare: Subscribable<MediaEntry | undefined>;

  joinMeeting(): Promise<void>;
  leaveMeeting(): Promise<void>;
}

export interface MeetMediaClientRequiredConfiguration {
  meetingSpaceId: string;
  numberOfVideoStreams: number;
  enableAudioStreams: boolean;
  accessToken: string;
  cloudProjectNumber?: string;
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
  private value: T;
  private callbacks: ((value: T) => void)[] = [];

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  subscribe(callback: (value: T) => void): void {
    this.callbacks.push(callback);
  }

  get(): T {
    return this.value;
  }

  set(newValue: T): void {
    this.value = newValue;
    this.callbacks.forEach(callback => callback(newValue));
  }
} 