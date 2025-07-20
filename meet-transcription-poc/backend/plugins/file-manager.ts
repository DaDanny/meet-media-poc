import { promises as fs } from 'fs';
import { join } from 'path';
import { TranscriptLine, TranscriptionSession } from '../types';

export class TranscriptFileManager {
  private transcriptsDir: string;
  private sessionFiles = new Map<string, string>();

  constructor(transcriptsDir = './transcripts') {
    this.transcriptsDir = transcriptsDir;
  }

  /**
   * Initialize a new session file
   */
  async initializeSession(sessionId: string, session: TranscriptionSession): Promise<void> {
    try {
      // Ensure transcripts directory exists
      await fs.mkdir(this.transcriptsDir, { recursive: true });

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `meeting-${session.meetingId}-${timestamp}.txt`;
      const filepath = join(this.transcriptsDir, filename);

      // Create initial file with header
      const header = `
=== MEETING TRANSCRIPT ===
Meeting ID: ${session.meetingId}
Session ID: ${sessionId}
Start Time: ${session.startTime.toISOString()}
Participants: ${session.participants.map(p => p.name).join(', ') || 'To be updated'}

--- TRANSCRIPT ---
`;

      await fs.writeFile(filepath, header, 'utf8');
      this.sessionFiles.set(sessionId, filepath);

      console.log(`📝 Transcript file initialized: ${filepath}`);

    } catch (error) {
      console.error(`Failed to initialize transcript file for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Append a transcript line to the session file
   */
  async appendTranscriptLine(sessionId: string, transcriptLine: TranscriptLine): Promise<void> {
    const filepath = this.sessionFiles.get(sessionId);
    if (!filepath) {
      console.warn(`No file path found for session ${sessionId}`);
      return;
    }

    try {
      // Only save final transcripts to avoid clutter
      if (!transcriptLine.isFinal) {
        return;
      }

      const timestamp = transcriptLine.timestamp.toLocaleTimeString();
      const speaker = transcriptLine.speaker.name;
      const confidence = transcriptLine.confidence ? ` (${Math.round(transcriptLine.confidence * 100)}%)` : '';
      
      const line = `[${timestamp}] ${speaker}${confidence}: ${transcriptLine.text}\n`;
      
      await fs.appendFile(filepath, line, 'utf8');

    } catch (error) {
      console.error(`Failed to append transcript line to file:`, error);
    }
  }

  /**
   * Finalize session file with summary
   */
  async finalizeSession(sessionId: string): Promise<void> {
    const filepath = this.sessionFiles.get(sessionId);
    if (!filepath) return;

    try {
      const footer = `
--- END OF TRANSCRIPT ---
End Time: ${new Date().toISOString()}
`;

      await fs.appendFile(filepath, footer, 'utf8');
      console.log(`📝 Transcript file finalized: ${filepath}`);

    } catch (error) {
      console.error(`Failed to finalize transcript file:`, error);
    }
  }

  /**
   * Export transcript in different formats
   */
  async exportTranscript(sessionId: string, format: 'txt' | 'json' | 'pdf' = 'txt'): Promise<string> {
    const filepath = this.sessionFiles.get(sessionId);
    if (!filepath) {
      throw new Error(`No transcript file found for session ${sessionId}`);
    }

    switch (format) {
      case 'txt':
        return filepath; // Already in .txt format

      case 'json':
        return await this.exportAsJson(filepath);

      case 'pdf':
        return await this.exportAsPdf(filepath);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get file location for a session
   */
  async getFileLocation(sessionId: string): Promise<string | null> {
    return this.sessionFiles.get(sessionId) || null;
  }

  /**
   * List all transcript files
   */
  async listTranscripts(): Promise<Array<{ sessionId: string; filepath: string; size: number }>> {
    const results = [];
    
    for (const [sessionId, filepath] of this.sessionFiles.entries()) {
      try {
        const stats = await fs.stat(filepath);
        results.push({
          sessionId,
          filepath,
          size: stats.size
        });
      } catch (error) {
        console.warn(`Could not get stats for file ${filepath}:`, error);
      }
    }

    return results;
  }

  private async exportAsJson(txtFilepath: string): Promise<string> {
    try {
      const content = await fs.readFile(txtFilepath, 'utf8');
      const lines = content.split('\n');
      
      // Parse transcript lines
      const transcriptLines = [];
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\] ([^:]+): (.+)$/);
        if (match) {
          transcriptLines.push({
            timestamp: match[1],
            speaker: match[2],
            text: match[3]
          });
        }
      }

      const jsonData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceFile: txtFilepath
        },
        transcript: transcriptLines
      };

      const jsonFilepath = txtFilepath.replace('.txt', '.json');
      await fs.writeFile(jsonFilepath, JSON.stringify(jsonData, null, 2), 'utf8');
      
      return jsonFilepath;

    } catch (error) {
      console.error('Failed to export as JSON:', error);
      throw error;
    }
  }

  private async exportAsPdf(txtFilepath: string): Promise<string> {
    // Note: For PDF export, you'd typically use a library like `puppeteer` or `jsPDF`
    // This is a simplified example that would need additional dependencies
    
    const pdfFilepath = txtFilepath.replace('.txt', '.pdf');
    
    // For now, just copy the txt file and change extension
    // In a real implementation, you'd format this properly as PDF
    await fs.copyFile(txtFilepath, pdfFilepath);
    
    console.log(`📄 PDF export created (placeholder): ${pdfFilepath}`);
    return pdfFilepath;
  }
} 