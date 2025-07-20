import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  PlusIcon, 
  PlayIcon, 
  DocumentTextIcon, 
  UserGroupIcon,
  ClockIcon,
  MicrophoneIcon,
  ChartBarIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { dashboardApi, meetingsApi, transcriptionApi } from '../services/api';
import { DashboardStats, Meeting } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { format, formatDistanceToNow } from 'date-fns';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { recentMeetings, addNotification } = useAppStore();
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoadingStats(true);
        
        // Load stats and recent meetings in parallel
        const [statsResponse, meetingsResponse] = await Promise.all([
          dashboardApi.getStats().catch(() => ({ data: null })),
          meetingsApi.getRecentMeetings(5).catch(() => ({ data: [] }))
        ]);

        if (statsResponse.data) {
          setStats(statsResponse.data);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to load dashboard data',
          timestamp: new Date(),
          isRead: false,
        });
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadDashboardData();
  }, [addNotification]);

  const handleStartQuickTranscription = async () => {
    const meetingSpaceId = prompt('Enter Google Meet Space ID (e.g., spaces/abc123):');
    if (!meetingSpaceId) return;

    setIsStartingTranscription(true);
    try {
      const response = await transcriptionApi.startTranscription({
        meetingSpaceId,
        numberOfVideoStreams: 0,
        enableAudioStreams: true,
        accessToken: 'demo-token', // In production, get real access token
        cloudProjectNumber: 'your-project-id', // In production, use real project ID
      });

      if (response.success) {
        navigate(`/transcription/${response.data?.sessionId}`);
        addNotification({
          type: 'success',
          title: 'Transcription Started',
          message: 'Successfully connected to meeting',
          timestamp: new Date(),
          isRead: false,
          autoHide: true,
        });
      }
    } catch (error) {
      console.error('Error starting transcription:', error);
      addNotification({
        type: 'error',
        title: 'Failed to Start',
        message: 'Could not start transcription. Please check the meeting ID.',
        timestamp: new Date(),
        isRead: false,
      });
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Mock stats if not available
  const displayStats = stats || {
    totalMeetings: 12,
    totalMinutes: 480,
    averageMeetingDuration: 45,
    totalTranscriptLines: 2847,
    aiQuestionsAnswered: 89,
    mostActiveDay: 'Wednesday',
    thisWeekMeetings: 3,
    thisMonthMeetings: 12,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {user?.given_name || user?.name}!
        </h1>
        <p className="text-gray-600">
          Here's what's happening with your meetings and transcriptions.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleStartQuickTranscription}
              disabled={isStartingTranscription}
              className="btn-primary flex items-center"
            >
              {isStartingTranscription ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <PlayIcon className="h-5 w-5 mr-2" />
              )}
              Start Transcription
            </button>
            <Link to="/meetings" className="btn-outline flex items-center">
              <CalendarIcon className="h-5 w-5 mr-2" />
              View All Meetings
            </Link>
            <button className="btn-outline flex items-center">
              <PlusIcon className="h-5 w-5 mr-2" />
              Schedule Meeting
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalendarIcon className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Meetings</p>
              <p className="text-2xl font-bold text-gray-900">
                {isLoadingStats ? '-' : displayStats.totalMeetings}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ClockIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Minutes</p>
              <p className="text-2xl font-bold text-gray-900">
                {isLoadingStats ? '-' : displayStats.totalMinutes.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Transcript Lines</p>
              <p className="text-2xl font-bold text-gray-900">
                {isLoadingStats ? '-' : displayStats.totalTranscriptLines.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <MicrophoneIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">AI Questions</p>
              <p className="text-2xl font-bold text-gray-900">
                {isLoadingStats ? '-' : displayStats.aiQuestionsAnswered}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity & Meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Meetings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Recent Meetings</h3>
              <Link to="/meetings" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                View all
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentMeetings.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No recent meetings</p>
                <button
                  onClick={handleStartQuickTranscription}
                  className="btn-primary"
                >
                  Start Your First Transcription
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentMeetings.slice(0, 5).map((meeting) => (
                  <div key={meeting.id} className="flex items-center space-x-4">
                    <div className={`flex-shrink-0 h-2 w-2 rounded-full ${
                      meeting.status === 'active' ? 'bg-green-500' : 
                      meeting.status === 'ended' ? 'bg-gray-400' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {meeting.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(meeting.startTime), 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        meeting.status === 'active' ? 'bg-green-100 text-green-800' :
                        meeting.status === 'ended' ? 'bg-gray-100 text-gray-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {meeting.status}
                      </span>
                      <Link
                        to={`/meetings/${meeting.id}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        <DocumentTextIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Analytics Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">This Week's Summary</h3>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Meetings this week</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {displayStats.thisWeekMeetings}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Average duration</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {displayStats.averageMeetingDuration} min
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <ChartBarIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Most active day</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {displayStats.mostActiveDay}
                </span>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-600 mb-1">
                    {Math.round((displayStats.thisWeekMeetings / displayStats.thisMonthMeetings) * 100)}%
                  </p>
                  <p className="text-sm text-gray-600">of monthly meetings completed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tips & Help */}
      <div className="mt-8 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">💡 Pro Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <strong>Voice Commands:</strong> Say "Hey AI" during meetings to ask questions
          </div>
          <div>
            <strong>Export Transcripts:</strong> Download meeting notes in TXT, JSON, or PDF format
          </div>
          <div>
            <strong>Real-time Summaries:</strong> Get AI-powered meeting insights as you go
          </div>
          <div>
            <strong>Meeting History:</strong> Access all your past transcriptions and analytics
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 