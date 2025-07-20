import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Meeting, 
  TranscriptionSession, 
  TranscriptLine, 
  AIResponse, 
  Notification, 
  Participant,
  AISettings,
  AppState 
} from '../types';

interface AppStore extends AppState {
  // WebSocket connection
  websocket: WebSocket | null;
  
  // Actions
  setCurrentMeeting: (meeting: Meeting | null) => void;
  addTranscriptLine: (line: TranscriptLine) => void;
  updateSession: (sessionId: string, updates: Partial<TranscriptionSession>) => void;
  addAIResponse: (response: AIResponse) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  markNotificationAsRead: (id: string) => void;
  setWebSocketConnection: (ws: WebSocket | null) => void;
  updateParticipants: (sessionId: string, participants: Participant[]) => void;
  updateAISettings: (sessionId: string, settings: AISettings) => void;
  addRecentMeeting: (meeting: Meeting) => void;
  setUserMeetings: (meetings: Meeting[]) => void;
  clearSession: (sessionId: string) => void;
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentMeeting: null,
    activeSessions: [],
    recentMeetings: [],
    userMeetings: [],
    isConnectedToWebSocket: false,
    notifications: [],
    websocket: null,

    // Actions
    setCurrentMeeting: (meeting: Meeting | null) => {
      set({ currentMeeting: meeting });
    },

    addTranscriptLine: (line: TranscriptLine) => {
      set((state) => {
        const activeSessions = state.activeSessions.map((session) => {
          if (session.meetingId === line.meetingId) {
            return {
              ...session,
              transcriptLines: [...session.transcriptLines, line],
              totalLines: session.totalLines + 1,
            };
          }
          return session;
        });
        return { activeSessions };
      });
    },

    updateSession: (sessionId: string, updates: Partial<TranscriptionSession>) => {
      set((state) => {
        const activeSessions = state.activeSessions.map((session) => {
          if (session.id === sessionId) {
            return { ...session, ...updates };
          }
          return session;
        });
        return { activeSessions };
      });
    },

    addAIResponse: (response: AIResponse) => {
      // Add AI response to the current session's context
      set((state) => {
        const activeSessions = state.activeSessions.map((session) => {
          if (session.meetingId === response.meetingId) {
            // Could store AI responses in session if needed
            return session;
          }
          return session;
        });
        return { activeSessions };
      });

      // Also add as notification
      get().addNotification({
        type: 'info',
        title: 'AI Response',
        message: `${response.askedBy}: ${response.question}`,
        timestamp: new Date(),
        isRead: false,
        autoHide: true,
      });
    },

    addNotification: (notification: Omit<Notification, 'id'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      set((state) => ({
        notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep only last 50
      }));

      // Auto-hide notifications after 5 seconds if autoHide is true
      if (notification.autoHide) {
        setTimeout(() => {
          get().removeNotification(newNotification.id);
        }, 5000);
      }
    },

    removeNotification: (id: string) => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    },

    markNotificationAsRead: (id: string) => {
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
      }));
    },

    setWebSocketConnection: (ws: WebSocket | null) => {
      set({ 
        websocket: ws, 
        isConnectedToWebSocket: ws?.readyState === WebSocket.OPEN 
      });
    },

    updateParticipants: (sessionId: string, participants: Participant[]) => {
      set((state) => {
        const activeSessions = state.activeSessions.map((session) => {
          if (session.id === sessionId) {
            return { ...session, participants };
          }
          return session;
        });
        return { activeSessions };
      });
    },

    updateAISettings: (sessionId: string, settings: AISettings) => {
      set((state) => {
        const activeSessions = state.activeSessions.map((session) => {
          if (session.id === sessionId) {
            return { ...session, aiSettings: settings };
          }
          return session;
        });
        return { activeSessions };
      });
    },

    addRecentMeeting: (meeting: Meeting) => {
      set((state) => {
        const recentMeetings = [
          meeting,
          ...state.recentMeetings.filter((m) => m.id !== meeting.id),
        ].slice(0, 10); // Keep only last 10 recent meetings
        return { recentMeetings };
      });
    },

    setUserMeetings: (meetings: Meeting[]) => {
      set({ userMeetings: meetings });
    },

    clearSession: (sessionId: string) => {
      set((state) => ({
        activeSessions: state.activeSessions.filter((s) => s.id !== sessionId),
      }));
    },
  }))
); 