// Core transcription types
export interface TranscriptLine {
  id: string;
  speaker: SpeakerInfo;
  text: string;
  timestamp: Date;
  isFinal: boolean;
  confidence?: number;
  speakerTag?: number;
}

export interface SpeakerInfo {
  id: string;
  name: string;
  role: 'manager' | 'direct_report' | 'unknown';
  csrc?: number;
}

export interface TranscriptionSession {
  id: string;
  meetingId: string;
  participants: SpeakerInfo[];
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'ended' | 'error';
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'transcript' | 'session_update' | 'error' | 'connection_status';
  payload: any;
  timestamp: Date;
}

export interface TranscriptMessage extends WebSocketMessage {
  type: 'transcript';
  payload: TranscriptLine;
}

export interface SessionUpdateMessage extends WebSocketMessage {
  type: 'session_update';
  payload: {
    participants: SpeakerInfo[];
    status: TranscriptionSession['status'];
  };
}

export interface ConnectionStatusMessage extends WebSocketMessage {
  type: 'connection_status';
  payload: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    meetConnectionState?: 'WAITING' | 'JOINED' | 'DISCONNECTED';
  };
}

// Google Speech-to-Text integration types
export interface SpeechConfig {
  languageCode: string;
  sampleRateHertz: number;
  encoding: string;
  enableSpeakerDiarization: boolean;
  diarizationSpeakerCount: number;
  model: string;
  useEnhanced: boolean;
}

// Meet Media API integration types
export interface MeetClientConfig {
  meetingSpaceId: string;
  accessToken: string;
  numberOfVideoStreams: number;
  enableAudioStreams: boolean;
  cloudProjectNumber: string;
}

export interface AudioStreamInfo {
  participantId: string;
  mediaStreamTrack: MediaStreamTrack;
  csrc?: number;
  isActive: boolean;
}

// Error types
export interface TranscriptionError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export class TranscriptionServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TranscriptionServiceError';
  }
} 