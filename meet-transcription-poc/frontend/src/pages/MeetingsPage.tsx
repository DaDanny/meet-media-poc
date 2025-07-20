import React from 'react';

const MeetingsPage: React.FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Meetings</h1>
        <p className="text-gray-600 mt-2">
          View and manage all your meeting transcriptions
        </p>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="bg-gray-100 rounded-full h-16 w-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Meetings page coming soon
          </h3>
          <p className="text-gray-500">
            This page will show all your meeting history, transcripts, and analytics.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MeetingsPage; 