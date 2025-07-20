import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';
import { createWebSocketConnection } from './services/api';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import LiveTranscriptionPage from './pages/LiveTranscriptionPage';
import MeetingDetailsPage from './pages/MeetingDetailsPage';
import SettingsPage from './pages/SettingsPage';

// Components
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';

// Google OAuth Client ID - this should be in your environment variables
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { setWebSocketConnection, addTranscriptLine, addAIResponse, updateParticipants } = useAppStore();

  // Initialize WebSocket connection when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const ws = createWebSocketConnection((data) => {
        switch (data.type) {
          case 'transcript':
            addTranscriptLine(data.payload);
            break;
          case 'ai_response':
            addAIResponse(data.payload);
            break;
          case 'session_update':
            if (data.payload.participants) {
              updateParticipants(data.payload.sessionId, data.payload.participants);
            }
            break;
          default:
            console.log('Unhandled WebSocket message:', data);
        }
      });

      setWebSocketConnection(ws);

      // Cleanup on unmount
      return () => {
        ws.close();
        setWebSocketConnection(null);
      };
    }
  }, [isAuthenticated, user, setWebSocketConnection, addTranscriptLine, addAIResponse, updateParticipants]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Public routes */}
              <Route 
                path="/login" 
                element={
                  isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
                } 
              />

              {/* Private routes */}
              <Route element={<PrivateRoute />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/meetings" element={<MeetingsPage />} />
                  <Route path="/meetings/:meetingId" element={<MeetingDetailsPage />} />
                  <Route path="/transcription/:sessionId" element={<LiveTranscriptionPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              {/* Default redirect */}
              <Route 
                path="/" 
                element={
                  <Navigate 
                    to={isAuthenticated ? "/dashboard" : "/login"} 
                    replace 
                  />
                } 
              />

              {/* Catch all */}
              <Route 
                path="*" 
                element={
                  <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                      <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                      <p className="text-gray-600 mb-8">Page not found</p>
                      <button 
                        onClick={() => window.history.back()}
                        className="btn-primary"
                      >
                        Go Back
                      </button>
                    </div>
                  </div>
                } 
              />
            </Routes>
          </div>
        </Router>
      </ErrorBoundary>
    </GoogleOAuthProvider>
  );
}

export default App;
