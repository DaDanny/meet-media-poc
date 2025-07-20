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
  role: "manager" | "direct_report" | "unknown";
  csrc?: number;
}

export interface TranscriptionSession {
  id: string;
  meetingId: string;
  participants: SpeakerInfo[];
  startTime: Date;
  endTime?: Date;
  status: "active" | "ended" | "error";
}

export interface MeetClientConfig {
  meetingSpaceId: string;
  accessToken: string;
  numberOfVideoStreams: number;
  enableAudioStreams: boolean;
  cloudProjectNumber: string;
}

export interface WebSocketMessage {
  type: "transcript" | "session_update" | "error" | "connection_status";
  payload: any;
  timestamp: Date;
}

export class TranscriptionServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "TranscriptionServiceError";
  }
}
