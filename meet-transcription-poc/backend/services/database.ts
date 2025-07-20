import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { User, Meeting, TranscriptLine, AIResponse, MeetingSummary, Participant } from '../types';

// Initialize Firebase Admin SDK
let db: Firestore;

export function initializeDatabase() {
  try {
    // Initialize Firebase Admin SDK
    // In production, you'd use a service account key file
    const serviceAccount: ServiceAccount = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-project-id',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    };

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      console.warn('⚠️  Firebase credentials not found. Using Firestore emulator or default credentials.');
      // For development, you can use the emulator or default credentials
      initializeApp();
    } else {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    }

    db = getFirestore();
    console.log('✅ Firestore database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firestore:', error);
    throw error;
  }
}

// Database Schema:
// /users/{userId} - User profiles and settings
// /meetings/{meetingId} - Meeting metadata and participants
// /meetings/{meetingId}/transcripts/{transcriptId} - Individual transcript lines
// /meetings/{meetingId}/ai_responses/{responseId} - AI bot responses
// /meetings/{meetingId}/summaries/{summaryId} - AI-generated summaries
// /user_meetings/{userId}/meetings/{meetingId} - User's meeting associations

export class DatabaseService {
  
  // ==================== USER MANAGEMENT ====================
  
  /**
   * Create or update user profile from Google OAuth
   */
  async createOrUpdateUser(userData: Partial<User>): Promise<User> {
    if (!userData.id) {
      throw new Error('User ID is required');
    }

    const userRef = db.collection('users').doc(userData.id);
    
    const existingUser = await userRef.get();
    
    const now = new Date();
    const userDoc: User = {
      id: userData.id,
      email: userData.email || '',
      name: userData.name || '',
      picture: userData.picture,
      given_name: userData.given_name,
      family_name: userData.family_name,
      verified_email: userData.verified_email || false,
      hd: userData.hd,
      createdAt: existingUser.exists ? existingUser.data()?.createdAt : now,
      updatedAt: now,
      lastLoginAt: now,
      preferences: existingUser.exists ? existingUser.data()?.preferences : {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        notifications: {
          email: true,
          browser: true,
          meetingReminders: true,
          transcriptReady: true,
        },
        privacy: {
          shareAnalytics: true,
          retainTranscripts: true,
          autoDeleteAfterDays: 90,
        },
        ai: {
          defaultEnabled: true,
          autoSummary: true,
          voiceCommandsEnabled: true,
        },
      },
    };

    await userRef.set(userDoc, { merge: true });
    
    console.log(`✅ User ${existingUser.exists ? 'updated' : 'created'}: ${userData.email}`);
    return userDoc;
  }

  /**
   * Get user profile by ID
   */
  async getUser(userId: string): Promise<User | null> {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return null;
    }

    return userDoc.data() as User;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    await db.collection('users').doc(userId).update({
      preferences: preferences,
      updatedAt: new Date(),
    });
  }

  // ==================== MEETING MANAGEMENT ====================

  /**
   * Create a new meeting record
   */
  async createMeeting(meetingData: {
    meetingSpaceId: string;
    title?: string;
    ownerId: string;
    participants?: Participant[];
  }): Promise<Meeting> {
    const meetingRef = db.collection('meetings').doc();
    
    const meeting: Meeting = {
      id: meetingRef.id,
      meetingSpaceId: meetingData.meetingSpaceId,
      title: meetingData.title || `Meeting ${new Date().toLocaleDateString()}`,
      startTime: new Date(),
      status: 'active',
      participants: meetingData.participants || [],
      ownerId: meetingData.ownerId,
      isPrivate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await meetingRef.set(meeting);

    // Create user association
    await this.addUserToMeeting(meetingData.ownerId, meeting.id);

    console.log(`✅ Meeting created: ${meeting.id}`);
    return meeting;
  }

  /**
   * Update meeting status and metadata
   */
  async updateMeeting(meetingId: string, updates: Partial<Meeting>): Promise<void> {
    await db.collection('meetings').doc(meetingId).update({
      ...updates,
      updatedAt: new Date(),
    });
  }

  /**
   * End a meeting
   */
  async endMeeting(meetingId: string): Promise<void> {
    await db.collection('meetings').doc(meetingId).update({
      endTime: new Date(),
      status: 'ended',
      updatedAt: new Date(),
    });
  }

  /**
   * Get meeting by ID
   */
  async getMeeting(meetingId: string): Promise<Meeting | null> {
    const meetingDoc = await db.collection('meetings').doc(meetingId).get();
    
    if (!meetingDoc.exists) {
      return null;
    }

    return meetingDoc.data() as Meeting;
  }

  /**
   * Add user to meeting participants
   */
  async addUserToMeeting(userId: string, meetingId: string): Promise<void> {
    const userMeetingRef = db.collection('user_meetings').doc(userId).collection('meetings').doc(meetingId);
    
    await userMeetingRef.set({
      meetingId,
      joinedAt: new Date(),
      role: 'participant',
    });
  }

  /**
   * Get user's meetings with pagination
   */
  async getUserMeetings(userId: string, limit: number = 20, startAfter?: any): Promise<{meetings: Meeting[], hasMore: boolean}> {
    // Get user's meeting IDs
    let userMeetingsQuery = db.collection('user_meetings')
      .doc(userId)
      .collection('meetings')
      .orderBy('joinedAt', 'desc')
      .limit(limit + 1); // Get one extra to check if there are more

    if (startAfter) {
      userMeetingsQuery = userMeetingsQuery.startAfter(startAfter);
    }

    const userMeetingsSnapshot = await userMeetingsQuery.get();
    const meetingIds = userMeetingsSnapshot.docs.slice(0, limit).map(doc => doc.data().meetingId);
    
    const hasMore = userMeetingsSnapshot.docs.length > limit;

    if (meetingIds.length === 0) {
      return { meetings: [], hasMore: false };
    }

    // Get meeting details
    const meetingsSnapshot = await db.collection('meetings')
      .where('id', 'in', meetingIds)
      .get();

    const meetings = meetingsSnapshot.docs.map(doc => doc.data() as Meeting);

    return { meetings, hasMore };
  }

  // ==================== TRANSCRIPT MANAGEMENT ====================

  /**
   * Save transcript line
   */
  async saveTranscriptLine(meetingId: string, transcriptLine: TranscriptLine): Promise<void> {
    const transcriptRef = db.collection('meetings')
      .doc(meetingId)
      .collection('transcripts')
      .doc(transcriptLine.id);

    await transcriptRef.set({
      ...transcriptLine,
      createdAt: new Date(),
    });

    // Update meeting stats
    await this.updateMeetingStats(meetingId, 'transcriptLines', 1);
  }

  /**
   * Get meeting transcript
   */
  async getMeetingTranscript(meetingId: string, limit: number = 100): Promise<TranscriptLine[]> {
    const transcriptSnapshot = await db.collection('meetings')
      .doc(meetingId)
      .collection('transcripts')
      .orderBy('timestamp', 'asc')
      .limit(limit)
      .get();

    return transcriptSnapshot.docs.map(doc => doc.data() as TranscriptLine);
  }

  /**
   * Search transcripts by text
   */
  async searchTranscripts(userId: string, searchTerm: string, limit: number = 50): Promise<TranscriptLine[]> {
    // Note: Full-text search in Firestore is limited. For production, consider using Algolia or Elasticsearch
    const userMeetings = await this.getUserMeetings(userId, 100);
    const results: TranscriptLine[] = [];

    for (const meeting of userMeetings.meetings) {
      const transcriptSnapshot = await db.collection('meetings')
        .doc(meeting.id)
        .collection('transcripts')
        .where('text', '>=', searchTerm)
        .where('text', '<=', searchTerm + '\uf8ff')
        .limit(10)
        .get();

      results.push(...transcriptSnapshot.docs.map(doc => doc.data() as TranscriptLine));
    }

    return results.slice(0, limit);
  }

  // ==================== AI RESPONSES & SUMMARIES ====================

  /**
   * Save AI response
   */
  async saveAIResponse(meetingId: string, aiResponse: AIResponse): Promise<void> {
    const responseRef = db.collection('meetings')
      .doc(meetingId)
      .collection('ai_responses')
      .doc(aiResponse.id);

    await responseRef.set({
      ...aiResponse,
      createdAt: new Date(),
    });

    // Update meeting stats
    await this.updateMeetingStats(meetingId, 'aiInteractions', 1);
  }

  /**
   * Get AI responses for a meeting
   */
  async getMeetingAIResponses(meetingId: string): Promise<AIResponse[]> {
    const responsesSnapshot = await db.collection('meetings')
      .doc(meetingId)
      .collection('ai_responses')
      .orderBy('timestamp', 'asc')
      .get();

    return responsesSnapshot.docs.map(doc => doc.data() as AIResponse);
  }

  /**
   * Save meeting summary
   */
  async saveMeetingSummary(meetingId: string, summary: MeetingSummary): Promise<void> {
    const summaryRef = db.collection('meetings')
      .doc(meetingId)
      .collection('summaries')
      .doc(summary.id);

    await summaryRef.set({
      ...summary,
      createdAt: new Date(),
    });

    // Also update the meeting with the latest summary
    await db.collection('meetings').doc(meetingId).update({
      aiSummary: summary.summary,
      updatedAt: new Date(),
    });
  }

  /**
   * Get latest meeting summary
   */
  async getLatestMeetingSummary(meetingId: string): Promise<MeetingSummary | null> {
    const summarySnapshot = await db.collection('meetings')
      .doc(meetingId)
      .collection('summaries')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (summarySnapshot.empty) {
      return null;
    }

    return summarySnapshot.docs[0].data() as MeetingSummary;
  }

  // ==================== ANALYTICS & STATS ====================

  /**
   * Update meeting statistics
   */
  private async updateMeetingStats(meetingId: string, field: string, increment: number): Promise<void> {
    const meetingRef = db.collection('meetings').doc(meetingId);
    
    await meetingRef.update({
      [`stats.${field}`]: FieldValue.increment(increment),
      updatedAt: new Date(),
    });
  }

  /**
   * Get user dashboard statistics
   */
  async getUserDashboardStats(userId: string): Promise<any> {
    const userMeetings = await this.getUserMeetings(userId, 1000); // Get all meetings for stats
    
    const totalMeetings = userMeetings.meetings.length;
    const totalMinutes = userMeetings.meetings.reduce((sum, meeting) => {
      if (meeting.endTime && meeting.startTime) {
        return sum + Math.round((meeting.endTime.getTime() - meeting.startTime.getTime()) / 60000);
      }
      return sum;
    }, 0);

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    const thisWeekMeetings = userMeetings.meetings.filter(meeting => 
      meeting.startTime >= thisWeek
    ).length;

    const thisMonth = new Date();
    thisMonth.setDate(thisMonth.getDate() - 30);
    
    const thisMonthMeetings = userMeetings.meetings.filter(meeting => 
      meeting.startTime >= thisMonth
    ).length;

    return {
      totalMeetings,
      totalMinutes,
      averageMeetingDuration: totalMeetings > 0 ? Math.round(totalMinutes / totalMeetings) : 0,
      totalTranscriptLines: 0, // Would need to aggregate from subcollections
      aiQuestionsAnswered: 0,  // Would need to aggregate from subcollections
      mostActiveDay: 'Wednesday', // Would need to calculate from meeting data
      thisWeekMeetings,
      thisMonthMeetings,
    };
  }

  // ==================== REAL-TIME LISTENERS ====================

  /**
   * Listen to meeting transcript updates
   */
  listenToMeetingTranscripts(meetingId: string, callback: (transcripts: TranscriptLine[]) => void) {
    return db.collection('meetings')
      .doc(meetingId)
      .collection('transcripts')
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        const transcripts = snapshot.docs.map(doc => doc.data() as TranscriptLine);
        callback(transcripts);
      });
  }

  /**
   * Listen to meeting AI responses
   */
  listenToMeetingAIResponses(meetingId: string, callback: (responses: AIResponse[]) => void) {
    return db.collection('meetings')
      .doc(meetingId)
      .collection('ai_responses')
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        const responses = snapshot.docs.map(doc => doc.data() as AIResponse);
        callback(responses);
      });
  }

  /**
   * Listen to user's meetings
   */
  listenToUserMeetings(userId: string, callback: (meetings: Meeting[]) => void) {
    return db.collection('user_meetings')
      .doc(userId)
      .collection('meetings')
      .orderBy('joinedAt', 'desc')
      .limit(20)
      .onSnapshot(async (snapshot) => {
        const meetingIds = snapshot.docs.map(doc => doc.data().meetingId);
        
        if (meetingIds.length === 0) {
          callback([]);
          return;
        }

        const meetingsSnapshot = await db.collection('meetings')
          .where('id', 'in', meetingIds)
          .get();

        const meetings = meetingsSnapshot.docs.map(doc => doc.data() as Meeting);
        callback(meetings);
      });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Delete user data (GDPR compliance)
   */
  async deleteUserData(userId: string): Promise<void> {
    const batch = db.batch();

    // Delete user profile
    batch.delete(db.collection('users').doc(userId));

    // Delete user meetings associations
    const userMeetingsRef = db.collection('user_meetings').doc(userId);
    batch.delete(userMeetingsRef);

    // Note: In production, you might want to anonymize rather than delete meeting data
    // to preserve transcripts for other participants

    await batch.commit();
    console.log(`✅ User data deleted: ${userId}`);
  }

  /**
   * Cleanup old meetings (for data retention policies)
   */
  async cleanupOldMeetings(daysOld: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const oldMeetings = await db.collection('meetings')
      .where('startTime', '<', cutoffDate)
      .where('status', '==', 'ended')
      .get();

    const batch = db.batch();
    
    oldMeetings.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`✅ Cleaned up ${oldMeetings.size} old meetings`);
  }
}

// Singleton instance
export const databaseService = new DatabaseService(); 