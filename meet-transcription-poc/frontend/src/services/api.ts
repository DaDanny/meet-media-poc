import { ApiResponse, Meeting, TranscriptionSession, User, AISettings, MeetingAnalytics, DashboardStats } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// Helper function to make API requests
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get auth token from localStorage if available
  const token = localStorage.getItem('auth-token');
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        errorData
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError(0, 'Network error or server unavailable');
  }
}

// Authentication API
export const authApi = {
  // Google OAuth URL
  getGoogleAuthUrl: async (): Promise<{ authUrl: string }> => {
    return apiRequest('/auth/google/url');
  },

  // Exchange OAuth code for tokens
  exchangeOAuthCode: async (code: string): Promise<{ user: User; token: string }> => {
    return apiRequest('/auth/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  // Refresh token
  refreshToken: async (): Promise<{ token: string }> => {
    return apiRequest('/auth/refresh', { method: 'POST' });
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    return apiRequest('/auth/me');
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiRequest('/auth/logout', { method: 'POST' });
    localStorage.removeItem('auth-token');
  },
};

// Meetings API
export const meetingsApi = {
  // Get user's meetings
  getUserMeetings: async (page = 1, limit = 20): Promise<ApiResponse<Meeting[]>> => {
    return apiRequest(`/api/meetings?page=${page}&limit=${limit}`);
  },

  // Get recent meetings
  getRecentMeetings: async (limit = 10): Promise<ApiResponse<Meeting[]>> => {
    return apiRequest(`/api/meetings/recent?limit=${limit}`);
  },

  // Get meeting by ID
  getMeeting: async (meetingId: string): Promise<ApiResponse<Meeting>> => {
    return apiRequest(`/api/meetings/${meetingId}`);
  },

  // Create new meeting
  createMeeting: async (meetingData: Partial<Meeting>): Promise<ApiResponse<Meeting>> => {
    return apiRequest('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(meetingData),
    });
  },

  // Update meeting
  updateMeeting: async (meetingId: string, updates: Partial<Meeting>): Promise<ApiResponse<Meeting>> => {
    return apiRequest(`/api/meetings/${meetingId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // Delete meeting
  deleteMeeting: async (meetingId: string): Promise<ApiResponse<void>> => {
    return apiRequest(`/api/meetings/${meetingId}`, { method: 'DELETE' });
  },

  // Get meeting analytics
  getMeetingAnalytics: async (meetingId: string): Promise<ApiResponse<MeetingAnalytics>> => {
    return apiRequest(`/api/meetings/${meetingId}/analytics`);
  },
};

// Transcription API
export const transcriptionApi = {
  // Start transcription session
  startTranscription: async (config: {
    meetingSpaceId: string;
    numberOfVideoStreams: number;
    enableAudioStreams: boolean;
    accessToken: string;
    cloudProjectNumber: string;
  }): Promise<ApiResponse<{ sessionId: string }>> => {
    return apiRequest('/api/transcription/start', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  // Stop transcription session
  stopTranscription: async (sessionId: string): Promise<ApiResponse<void>> => {
    return apiRequest(`/api/transcription/stop/${sessionId}`, { method: 'POST' });
  },

  // Get transcription status
  getTranscriptionStatus: async (sessionId: string): Promise<ApiResponse<TranscriptionSession>> => {
    return apiRequest(`/api/transcription/status/${sessionId}`);
  },

  // Export transcript
  exportTranscript: async (sessionId: string, format: 'txt' | 'json' | 'pdf' = 'txt'): Promise<ApiResponse<{ filePath: string; downloadUrl: string }>> => {
    return apiRequest(`/api/transcription/export/${sessionId}/${format}`);
  },

  // Download transcript file
  downloadTranscript: async (sessionId: string, format: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/api/transcription/download/${sessionId}/${format}`);
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to download transcript');
    }
    return response.blob();
  },
};

// AI API
export const aiApi = {
  // Get AI summary
  getSummary: async (sessionId: string): Promise<ApiResponse<{ summary: string }>> => {
    return apiRequest(`/api/ai/summary/${sessionId}`);
  },

  // Ask AI question
  askQuestion: async (sessionId: string, question: string, askedBy?: string): Promise<ApiResponse<{ answer: string }>> => {
    return apiRequest(`/api/ai/question/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ question, askedBy }),
    });
  },

  // Get meeting insights
  getInsights: async (sessionId: string): Promise<ApiResponse<{
    actionItems: string[];
    keyDecisions: string[];
    participants: any[];
    meetingDuration: number;
    summary: string;
    aiSettings: AISettings;
  }>> => {
    return apiRequest(`/api/ai/insights/${sessionId}`);
  },

  // Update AI settings
  updateAISettings: async (sessionId: string, settings: Partial<AISettings>): Promise<ApiResponse<{ settings: AISettings }>> => {
    return apiRequest(`/api/ai/settings/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },

  // Get AI settings
  getAISettings: async (sessionId: string): Promise<ApiResponse<{ settings: AISettings }>> => {
    return apiRequest(`/api/ai/settings/${sessionId}`);
  },
};

// Dashboard API
export const dashboardApi = {
  // Get dashboard stats
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    return apiRequest('/api/dashboard/stats');
  },

  // Get recent activity
  getRecentActivity: async (limit = 20): Promise<ApiResponse<any[]>> => {
    return apiRequest(`/api/dashboard/activity?limit=${limit}`);
  },
};

// Health check
export const healthApi = {
  check: async (): Promise<{ status: string; timestamp: string }> => {
    return apiRequest('/health');
  },
};

// WebSocket connection helper
export const createWebSocketConnection = (onMessage: (data: any) => void): WebSocket => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.hostname}:3001`;
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return ws;
};

export { ApiError }; 