// Core transcription types
export interface TranscriptLine {
  id: string;
  speaker: SpeakerInfo;
  text: string;
  timestamp: Date;
  isFinal: boolean;
  confidence?: number;
  speakerTag?: number;
  meetingId: string;
  hasVoiceCommand?: boolean;
  createdAt?: Date;
}

export interface SpeakerInfo {
  id: string;
  name: string;
  role: 'manager' | 'direct_report' | 'unknown';
  csrc?: number;
}

// Enhanced types for database integration
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  verified_email: boolean;
  hd?: string; // hosted domain for Google Workspace
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    browser: boolean;
    meetingReminders: boolean;
    transcriptReady: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    retainTranscripts: boolean;
    autoDeleteAfterDays?: number;
  };
  ai: {
    defaultEnabled: boolean;
    autoSummary: boolean;
    voiceCommandsEnabled: boolean;
  };
}

export interface Meeting {
  id: string;
  meetingSpaceId: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in minutes
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  participants: Participant[];
  ownerId: string;
  transcriptId?: string;
  aiSummary?: string;
  tags?: string[];
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  stats?: {
    transcriptLines: number;
    aiInteractions: number;
    participantCount: number;
  };
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  role: 'host' | 'manager' | 'direct_report' | 'participant' | 'unknown';
  joinTime?: Date;
  leaveTime?: Date;
  isActive: boolean;
  avatarUrl?: string;
}

export interface AIResponse {
  id: string;
  question: string;
  answer: string;
  askedBy: string;
  confidence?: number;
  triggerType: 'voice_command' | 'manual';
  timestamp: Date;
  meetingId: string;
  createdAt?: Date;
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  participants: Participant[];
  generatedAt: Date;
  wordCount: number;
  createdAt?: Date;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  extractedAt: Date;
}

export interface TranscriptionSession {
  id: string;
  meetingId: string;
  participants: Participant[];
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'ended' | 'error';
  transcriptLines?: TranscriptLine[];
  totalLines?: number;
  aiSettings: AISettings;
  userId?: string; // Owner of the session
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'transcript' | 'session_update' | 'error' | 'connection_status' | 'ai_response' | 'ai_summary' | 'voice_command_detected';
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
    participants: Participant[];
    status: TranscriptionSession['status'];
    sessionId?: string;
    aiSettings?: AISettings;
  };
}

export interface ConnectionStatusMessage extends WebSocketMessage {
  type: 'connection_status';
  payload: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    meetConnectionState?: 'WAITING' | 'JOINED' | 'DISCONNECTED';
  };
}

// AI Bot message types
export interface AIResponseMessage extends WebSocketMessage {
  type: 'ai_response';
  payload: AIResponse;
}

export interface AISummaryMessage extends WebSocketMessage {
  type: 'ai_summary';
  payload: {
    summary: string;
    actionItems: string[];
    keyDecisions: string[];
    participants: Participant[];
    timestamp: Date;
  };
}

export interface VoiceCommandDetectedMessage extends WebSocketMessage {
  type: 'voice_command_detected';
  payload: {
    command: string;
    speaker: SpeakerInfo;
    originalText: string;
    timestamp: Date;
  };
}

// AI Settings and Configuration
export interface AISettings {
  enableQA: boolean;
  enableSummary: boolean;
  enableFileExport: boolean;
  voiceCommands: string[];
  autoResponseEnabled: boolean;
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

// Dashboard and Analytics types
export interface DashboardStats {
  totalMeetings: number;
  totalMinutes: number;
  averageMeetingDuration: number;
  totalTranscriptLines: number;
  aiQuestionsAnswered: number;
  mostActiveDay: string;
  thisWeekMeetings: number;
  thisMonthMeetings: number;
}

export interface MeetingAnalytics {
  meetingId: string;
  duration: number;
  participantCount: number;
  totalWords: number;
  averageConfidence: number;
  speechDistribution: SpeechDistribution[];
  sentimentAnalysis?: SentimentData;
  topTopics: string[];
  questionsAsked: number;
  aiInteractions: number;
}

export interface SpeechDistribution {
  participantId: string;
  participantName: string;
  wordCount: number;
  percentage: number;
  speakingTime: number; // in seconds
}

export interface SentimentData {
  overall: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
  confidence: number;
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
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

// Authentication types
export interface AuthTokenPayload {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  iat?: number;
  exp?: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
} 