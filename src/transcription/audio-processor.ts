import { SpeechClient } from '@google-cloud/speech';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptLine, SpeakerInfo, TranscriptionServiceError } from '../types';

export interface SpeechConfig {
  languageCode: string;
  enableSpeakerDiarization: boolean;
  diarizationSpeakerCount: number;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  speakerTag?: number;
  languageCode: string;
}

export class AudioTranscriptionProcessor extends EventEmitter {
  private speechClient: SpeechClient;
  private activeStreams = new Map<string, any>(); // participantId -> speech stream
  private speakers = new Map<string, SpeakerInfo>();

  constructor(config?: Partial<SpeechConfig>) {
    super();
    this.speechClient = new SpeechClient();
  }

  /**
   * Process a Meet audio stream track for transcription
   * This is a simplified version for the POC
   */
  async processAudioTrack(
    track: MediaStreamTrack, 
    participantInfo: SpeakerInfo
  ): Promise<void> {
    if (track.kind !== 'audio') {
      throw new TranscriptionServiceError(
        'INVALID_TRACK_TYPE',
        'Only audio tracks can be processed for transcription'
      );
    }

    const participantId = participantInfo.id;
    this.speakers.set(participantId, participantInfo);

    console.log(`Started processing audio for ${participantInfo.name}`);
    
    // For the POC, we'll simulate transcription events
    // In the real implementation, this would process the actual audio stream
    this.simulateTranscription(participantInfo);
  }

  /**
   * Simulate transcription for POC purposes
   * In production, this would be replaced with actual audio processing
   */
  private simulateTranscription(speakerInfo: SpeakerInfo): void {
    const samplePhrases = [
      "Hello, how are you doing today?",
      "I wanted to discuss the quarterly results with you.",
      "The project is progressing well according to schedule.",
      "Do you have any questions about the recent changes?",
      "Let's review the action items from our last meeting.",
      "I think we should focus on improving our metrics.",
      "What are your thoughts on the new strategy?",
      "We need to align on the deliverables for next month."
    ];

    let phraseIndex = 0;
    const interval = setInterval(() => {
      if (phraseIndex >= samplePhrases.length) {
        clearInterval(interval);
        return;
      }

      const phrase = samplePhrases[phraseIndex];
      
      // Emit interim result first
      this.emitTranscriptLine({
        speaker: speakerInfo,
        text: phrase.substring(0, phrase.length / 2) + "...",
        isFinal: false,
        confidence: 0.8
      });

      // Then emit final result after a short delay
      setTimeout(() => {
        this.emitTranscriptLine({
          speaker: speakerInfo,
          text: phrase,
          isFinal: true,
          confidence: 0.95
        });
      }, 1000);

      phraseIndex++;
    }, 5000); // New phrase every 5 seconds

    // Store the interval so we can clean it up
    this.activeStreams.set(speakerInfo.id, interval);
  }

  /**
   * Emit a transcript line event
   */
  private emitTranscriptLine(params: {
    speaker: SpeakerInfo;
    text: string;
    isFinal: boolean;
    confidence: number;
  }): void {
    const transcriptLine: TranscriptLine = {
      id: uuidv4(),
      speaker: params.speaker,
      text: params.text,
      timestamp: new Date(),
      isFinal: params.isFinal,
      confidence: params.confidence,
      speakerTag: undefined
    };

    this.emit('transcript', transcriptLine);
    
    console.log(`[${params.speaker.name}] ${params.isFinal ? 'FINAL' : 'INTERIM'}: ${params.text}`);
  }

  /**
   * Stop processing for a specific participant
   */
  stopParticipantTranscription(participantId: string): void {
    const interval = this.activeStreams.get(participantId);
    if (interval) {
      clearInterval(interval);
      this.activeStreams.delete(participantId);
      this.speakers.delete(participantId);
      console.log(`Stopped transcription for participant ${participantId}`);
    }
  }

  /**
   * Stop all transcription processing
   */
  stopAllTranscription(): void {
    for (const [participantId, interval] of this.activeStreams) {
      clearInterval(interval);
      console.log(`Stopped transcription for participant ${participantId}`);
    }
    this.activeStreams.clear();
    this.speakers.clear();
  }

  /**
   * Get active transcription participants
   */
  getActiveParticipants(): SpeakerInfo[] {
    return Array.from(this.speakers.values());
  }

  /**
   * Update speaker information
   */
  updateSpeakerInfo(participantId: string, speakerInfo: Partial<SpeakerInfo>): void {
    const existing = this.speakers.get(participantId);
    if (existing) {
      this.speakers.set(participantId, { ...existing, ...speakerInfo });
    }
  }
} 