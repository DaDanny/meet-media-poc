import { TranscriptLine, TranscriptionSession } from '../types';

interface QuestionContext {
  question: string;
  askedBy: string;
  timestamp: Date;
  context: TranscriptLine[];
  answer?: string;
  confidence?: number;
}

export class MeetingQABot {
  private genAI: any; // GoogleGenerativeAI instance
  private model: any;
  private sessionContexts = new Map<string, TranscriptLine[]>();
  private questionHistory = new Map<string, QuestionContext[]>();
  private isEnabled = true;

  constructor() {
    // Initialize Gemini AI client for Q&A
    // this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    // this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    
    console.log('🤖 Meeting Q&A Bot initialized');
  }

  /**
   * Initialize Q&A bot for a new meeting
   */
  async initializeForMeeting(sessionId: string, session: TranscriptionSession): Promise<void> {
    this.sessionContexts.set(sessionId, []);
    this.questionHistory.set(sessionId, []);
    
    console.log(`🤖 Q&A Bot ready for session ${sessionId}`);
  }

  /**
   * Process a question from a participant
   */
  async processQuestion(sessionId: string, question: string, askedBy?: string): Promise<string> {
    try {
      const context = this.sessionContexts.get(sessionId) || [];
      const questionCtx: QuestionContext = {
        question,
        askedBy: askedBy || 'Unknown',
        timestamp: new Date(),
        context: [...context] // Snapshot of current context
      };

      // Generate answer using AI with meeting context
      const answer = await this.generateAnswer(questionCtx, context);
      questionCtx.answer = answer;
      questionCtx.confidence = this.calculateConfidence(question, context);

      // Store question history
      const history = this.questionHistory.get(sessionId) || [];
      history.push(questionCtx);
      this.questionHistory.set(sessionId, history);

      console.log(`🤖 Answered question from ${askedBy}: "${question.slice(0, 50)}..."`);
      
      return answer;

    } catch (error) {
      console.error(`Failed to process question:`, error);
      return `I apologize, but I encountered an error processing your question. Please try rephrasing it.`;
    }
  }

  /**
   * Update context with new transcript line
   */
  updateContext(sessionId: string, transcriptLine: TranscriptLine): void {
    const context = this.sessionContexts.get(sessionId) || [];
    context.push(transcriptLine);
    
    // Keep only last 50 lines for context (to manage memory and API costs)
    if (context.length > 50) {
      context.splice(0, context.length - 50);
    }
    
    this.sessionContexts.set(sessionId, context);
  }

  /**
   * Check if a statement contains a question
   */
  isQuestion(text: string): boolean {
    const questionIndicators = [
      '?',
      'what is', 'what are', 'what does', 'what should',
      'how do', 'how can', 'how should', 'how would',
      'why', 'when', 'where', 'who',
      'can you', 'could you', 'would you',
      'please explain', 'help me understand',
      'clarify', 'elaborate'
    ];

    const lowerText = text.toLowerCase();
    return questionIndicators.some(indicator => lowerText.includes(indicator));
  }

  /**
   * Get question history for a session
   */
  getQuestionHistory(sessionId: string): QuestionContext[] {
    return this.questionHistory.get(sessionId) || [];
  }

  /**
   * Get bot status
   */
  async getStatus(sessionId: string): Promise<{
    isEnabled: boolean;
    questionsAnswered: number;
    contextLines: number;
  }> {
    const context = this.sessionContexts.get(sessionId) || [];
    const history = this.questionHistory.get(sessionId) || [];

    return {
      isEnabled: this.isEnabled,
      questionsAnswered: history.length,
      contextLines: context.length
    };
  }

  /**
   * Enable or disable the Q&A bot
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`🤖 Q&A Bot ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * End meeting and cleanup
   */
  async endMeeting(sessionId: string): Promise<void> {
    const history = this.questionHistory.get(sessionId) || [];
    console.log(`🤖 Meeting ended. Answered ${history.length} questions in session ${sessionId}`);
    
    // Optional: Save question history to file or database
    // await this.saveQuestionHistory(sessionId, history);
  }

  private async generateAnswer(questionCtx: QuestionContext, context: TranscriptLine[]): Promise<string> {
    // MOCK IMPLEMENTATION - Replace with actual Gemini API call
    // Example of what the real implementation would look like:
    /*
    const contextText = context.slice(-10).map(line => 
      `${line.speaker.name}: ${line.text}`
    ).join('\n');

    const prompt = `
    You are an AI assistant helping in a live meeting. Please answer the following question based on the recent meeting context.

    Recent meeting discussion:
    ${contextText}

    Question asked by ${questionCtx.askedBy}: ${questionCtx.question}

    Please provide a helpful, concise answer that:
    1. Directly addresses the question
    2. Uses information from the meeting context when relevant
    3. Is appropriate for a professional meeting setting
    4. Admits if you don't have enough context to answer fully

    Answer:
    `;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
    */

    // Mock answer generation based on question type
    const question = questionCtx.question.toLowerCase();

    if (question.includes('what') && question.includes('next')) {
      return "Based on our discussion, the next steps appear to be reviewing the action items and setting up follow-up meetings. However, I'd recommend confirming this with the meeting participants.";
    }

    if (question.includes('who') && question.includes('responsible')) {
      return "From the context I have, it seems action items are being discussed. I'd suggest explicitly assigning ownership to ensure clarity on responsibilities.";
    }

    if (question.includes('when') || question.includes('deadline')) {
      return "I haven't heard specific deadlines mentioned in our recent discussion. It would be good to establish clear timelines for any action items.";
    }

    if (question.includes('how')) {
      return "That's a great question about implementation. Based on the discussion so far, it might be helpful to break this down into specific steps and identify what resources or support might be needed.";
    }

    if (question.includes('summary') || question.includes('recap')) {
      const speakers = Array.from(new Set(context.slice(-10).map(line => line.speaker.name)));
      return `Here's a quick recap: We've had participation from ${speakers.join(', ')} discussing various topics. For a detailed summary, I can provide that at the end of the meeting.`;
    }

    // Generic helpful response
    return `That's an interesting question about "${questionCtx.question}". Based on our meeting discussion, I'd recommend clarifying this with the team to ensure everyone is aligned. If you need more specific information, please feel free to ask with more context.`;
  }

  private calculateConfidence(question: string, context: TranscriptLine[]): number {
    // Simple confidence calculation based on context relevance
    let confidence = 0.5; // Base confidence

    // Higher confidence if we have recent context
    if (context.length > 5) confidence += 0.2;
    if (context.length > 20) confidence += 0.1;

    // Higher confidence for specific question types
    const question_lower = question.toLowerCase();
    if (question_lower.includes('summary') || question_lower.includes('recap')) {
      confidence += 0.2;
    }

    if (question_lower.includes('next steps') || question_lower.includes('action')) {
      confidence += 0.15;
    }

    return Math.min(confidence, 0.95); // Cap at 95%
  }

  // Helper method to detect if someone is asking for help or clarification
  static detectNeedsHelp(transcriptLine: TranscriptLine): boolean {
    const helpIndicators = [
      'confused', 'unclear', 'don\'t understand', 'help me',
      'not sure', 'clarify', 'explain', 'what does this mean'
    ];

    const text = transcriptLine.text.toLowerCase();
    return helpIndicators.some(indicator => text.includes(indicator));
  }

  // Helper method to suggest proactive help
  async suggestProactiveHelp(sessionId: string, transcriptLine: TranscriptLine): Promise<string | null> {
    if (MeetingQABot.detectNeedsHelp(transcriptLine)) {
      return `I noticed ${transcriptLine.speaker.name} might need clarification. Would you like me to help explain or summarize the recent discussion?`;
    }

    return null;
  }
} 