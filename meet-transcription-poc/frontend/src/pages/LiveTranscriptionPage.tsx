import React from 'react';
import { useParams } from 'react-router-dom';

const LiveTranscriptionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Live Transcription</h1>
        <p className="text-gray-600 mt-2">
          Session ID: {sessionId}
        </p>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="bg-green-100 rounded-full h-16 w-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Live Transcription Interface
          </h3>
          <p className="text-gray-500 mb-4">
            This will be the real-time transcription dashboard with AI bot controls, 
            live transcript, participant management, and voice command detection.
          </p>
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            🎤 Ready for Development
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTranscriptionPage; 