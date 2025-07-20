import React from 'react';
import { useParams } from 'react-router-dom';

const MeetingDetailsPage: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Meeting Details</h1>
        <p className="text-gray-600 mt-2">
          Meeting ID: {meetingId}
        </p>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="bg-blue-100 rounded-full h-16 w-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Meeting Details & Transcript
          </h3>
          <p className="text-gray-500">
            This page will show the full meeting transcript, analytics, 
            AI summaries, and export options.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MeetingDetailsPage; 