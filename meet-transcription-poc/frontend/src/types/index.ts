// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  verified_email: boolean;
  hd?: string; // hosted domain for Google Workspace
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Meeting and Session Types
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

// Transcription Types
export interface TranscriptLine {
  id: string;
  meetingId: string;
  speaker: Participant;
  text: string;
  timestamp: Date;
  isFinal: boolean;
  confidence?: number;
  speakerTag?: number;
  hasVoiceCommand?: boolean;
}

export interface TranscriptionSession {
  id: string;
  meetingId: string;
  participants: Participant[];
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'ended' | 'error';
  transcriptLines: TranscriptLine[];
  totalLines: number;
  aiSettings: AISettings;
}

// AI and Bot Types
export interface AISettings {
  enableQA: boolean;
  enableSummary: boolean;
  enableFileExport: boolean;
  voiceCommands: string[];
  autoResponseEnabled: boolean;
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

// WebSocket Message Types
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
    sessionId: string;
    aiSettings?: AISettings;
  };
}

export interface AIResponseMessage extends WebSocketMessage {
  type: 'ai_response';
  payload: AIResponse;
}

// UI State Types
export interface AppState {
  currentMeeting: Meeting | null;
  activeSessions: TranscriptionSession[];
  recentMeetings: Meeting[];
  userMeetings: Meeting[];
  isConnectedToWebSocket: boolean;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  autoHide?: boolean;
}

// API Response Types
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
  };
}

// Meeting Analytics Types
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

// Dashboard Types
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

// Settings and Preferences
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

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
}

// Export all as default
export type {
  User,
  AuthState,
  Meeting,
  Participant,
  TranscriptLine,
  TranscriptionSession,
  AISettings,
  AIResponse,
  MeetingSummary,
  ActionItem,
  WebSocketMessage,
  AppState,
  Notification,
  ApiResponse,
  MeetingAnalytics,
  DashboardStats,
  UserPreferences,
  AppError
}; 