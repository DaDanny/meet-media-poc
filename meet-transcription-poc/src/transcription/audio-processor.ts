import { SpeechClient } from '@google-cloud/speech';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  TranscriptLine,
  SpeakerInfo,
  SpeechConfig,
  TranscriptionServiceError,
  AudioStreamInfo
} from '../types';
import { MeetStreamTrack, MediaStreamAudioTrack, AudioData } from '../../meet-transcription-poc/src/meet-client/types';

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
  private speechConfig: SpeechConfig;
  private speakers = new Map<string, SpeakerInfo>();

  constructor(config?: Partial<SpeechConfig>) {
    super();
    this.speechClient = new SpeechClient();
    this.speechConfig = {
      languageCode: config?.languageCode || 'en-US',
      sampleRateHertz: 48000, // Meet uses 48kHz for Opus
      encoding: 'WEBM_OPUS',
      enableSpeakerDiarization: config?.enableSpeakerDiarization ?? true,
      diarizationSpeakerCount: config?.diarizationSpeakerCount || 2,
      model: 'latest_long',
      useEnhanced: true,
      ...config
    };
  }

  /**
   * Process a Meet audio stream track for transcription
   */
  async processAudioTrack(
    meetStreamTrack: MeetStreamTrack, 
    participantInfo: SpeakerInfo
  ): Promise<void> {
    const { mediaStreamTrack } = meetStreamTrack;
    
    if (mediaStreamTrack.kind !== 'audio') {
      throw new TranscriptionServiceError(
        'INVALID_TRACK_TYPE',
        'Only audio tracks can be processed for transcription'
      );
    }

    const participantId = participantInfo.id;
    this.speakers.set(participantId, participantInfo);

    try {
      // Create a speech recognition stream for this participant
      const recognizeStream = this.createRecognitionStream(participantId);
      this.activeStreams.set(participantId, recognizeStream);

      // Process the audio track using MediaStreamTrackProcessor
      await this.processMediaStreamTrack(
        mediaStreamTrack as MediaStreamAudioTrack,
        recognizeStream,
        participantInfo
      );

    } catch (error) {
      this.emit('error', new TranscriptionServiceError(
        'AUDIO_PROCESSING_ERROR',
        `Failed to process audio track for participant ${participantId}`,
        error
      ));
    }
  }

  /**
   * Create a Google Speech-to-Text recognition stream
   */
  private createRecognitionStream(participantId: string) {
    const request = {
      config: {
        encoding: this.speechConfig.encoding as any,
        sampleRateHertz: this.speechConfig.sampleRateHertz,
        languageCode: this.speechConfig.languageCode,
        enableSpeakerDiarization: this.speechConfig.enableSpeakerDiarization,
        diarizationSpeakerCount: this.speechConfig.diarizationSpeakerCount,
        model: this.speechConfig.model,
        useEnhanced: this.speechConfig.useEnhanced,
        profanityFilter: false,
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
      },
      interimResults: true,
      singleUtterance: false
    };

    const recognizeStream = this.speechClient.streamingRecognize(request);

    // Handle transcription results
    recognizeStream.on('data', (data: any) => {
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const alternative = result.alternatives[0];
        
        if (alternative && alternative.transcript) {
          this.handleTranscriptionResult({
            transcript: alternative.transcript,
            confidence: alternative.confidence || 0,
            isFinal: result.isFinal || false,
            speakerTag: result.speakerTag,
            languageCode: this.speechConfig.languageCode
          }, participantId);
        }
      }
    });

    recognizeStream.on('error', (error: Error) => {
      this.emit('error', new TranscriptionServiceError(
        'SPEECH_API_ERROR',
        `Speech recognition error for participant ${participantId}`,
        error
      ));
    });

    return recognizeStream;
  }

  /**
   * Process MediaStreamTrack using the newer MediaStreamTrackProcessor API
   */
  private async processMediaStreamTrack(
    track: MediaStreamAudioTrack,
    recognizeStream: any,
    participantInfo: SpeakerInfo
  ): Promise<void> {
    try {
      // Use MediaStreamTrackProcessor for real-time audio processing
      const processor = new (window as any).MediaStreamTrackProcessor({
        track: track
      });

      const reader = processor.readable.getReader();
      
      // Process audio frames
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`Audio stream ended for participant ${participantInfo.id}`);
          break;
        }

        // Convert AudioData to buffer and send to Speech API
        const audioBuffer = this.audioDataToBuffer(value as AudioData);
        if (audioBuffer && audioBuffer.length > 0) {
          recognizeStream.write({ audioContent: audioBuffer });
        }

        // Important: Clean up the frame
        value.close();
      }
    } catch (error) {
      throw new TranscriptionServiceError(
        'MEDIA_PROCESSING_ERROR',
        `Failed to process media stream track`,
        error
      );
    } finally {
      recognizeStream.end();
    }
  }

  /**
   * Convert WebRTC AudioData to Buffer for Speech API
   */
  private audioDataToBuffer(audioData: AudioData): Buffer {
    try {
      const size = audioData.allocationSize();
      const arrayBuffer = new ArrayBuffer(size);
      audioData.copyTo(arrayBuffer, { planeIndex: 0 });
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error converting audio data to buffer:', error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Handle transcription results and emit events
   */
  private handleTranscriptionResult(
    result: TranscriptionResult,
    participantId: string
  ): void {
    const speaker = this.speakers.get(participantId);
    if (!speaker) {
      console.warn(`No speaker info found for participant ${participantId}`);
      return;
    }

    const transcriptLine: TranscriptLine = {
      id: uuidv4(),
      speaker,
      text: result.transcript,
      timestamp: new Date(),
      isFinal: result.isFinal,
      confidence: result.confidence,
      speakerTag: result.speakerTag
    };

    // Emit the transcript event
    this.emit('transcript', transcriptLine);

    // Log for debugging
    console.log(`[${speaker.name}] ${result.isFinal ? 'FINAL' : 'INTERIM'}: ${result.transcript}`);
  }

  /**
   * Stop processing for a specific participant
   */
  stopParticipantTranscription(participantId: string): void {
    const stream = this.activeStreams.get(participantId);
    if (stream) {
      stream.end();
      this.activeStreams.delete(participantId);
      this.speakers.delete(participantId);
      console.log(`Stopped transcription for participant ${participantId}`);
    }
  }

  /**
   * Stop all transcription processing
   */
  stopAllTranscription(): void {
    for (const [participantId, stream] of this.activeStreams) {
      stream.end();
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