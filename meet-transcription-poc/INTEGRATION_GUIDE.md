# 🔧 Integration Guide: Custom Functionality

## **How Transcription Works** 📋

### **Current Architecture Flow**

```
Google Meet Conference
         ↓
   Meet Media API
         ↓
  MeetClientAdapter (backend/meet-client/)
         ↓
AudioTranscriptionProcessor (backend/transcription/)
         ↓
  Google Speech-to-Text API
         ↓
  TranscriptionService (backend/api/)
         ↓
   WebSocket Server (backend/server.ts)
         ↓
  Frontend Dashboard (web/)
```

### **Key Points:**
- **NOT inside Google Meet**: The frontend dashboard is a separate web application
- **Real-time streaming**: Transcripts are sent via WebSocket to the dashboard
- **Server-side processing**: All AI processing happens on your backend
- **Plugin architecture**: Easy to add custom functionality

---

## **Custom Functionality Integration** 🚀

### **1. File Storage for Transcripts** 📝

**Location**: `backend/plugins/file-manager.ts` (created)

**Features:**
- ✅ Real-time .txt file creation
- ✅ Automatic file naming with timestamps
- ✅ Export to JSON and PDF formats
- ✅ File download API endpoints

**To Enable:**
```typescript
// In backend/api/transcription-service.ts
import { TranscriptFileManager } from '../plugins/file-manager';

constructor() {
  super();
  this.fileManager = new TranscriptFileManager('./transcripts');
}
```

**API Usage:**
```bash
# Export transcript
GET /api/transcription/export/{sessionId}/txt

# Download file
GET /api/transcription/download/{sessionId}/txt
```

---

### **2. Google Cloud Gemini Integration** 🤖

**Location**: `backend/plugins/gemini-processor.ts` (created)

**Features:**
- ✅ Real-time meeting summarization
- ✅ Action item extraction
- ✅ Key decision tracking
- ✅ Ongoing analysis of discussion

**To Enable:**
```bash
# Install Gemini AI package
npm install @google/generative-ai
```

```typescript
// In backend/plugins/gemini-processor.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

constructor() {
  this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
}
```

**API Usage:**
```bash
# Get current summary
GET /api/ai/summary/{sessionId}

# Get meeting insights
GET /api/ai/insights/{sessionId}
```

---

### **3. Meeting Q&A Bot** 💬

**Location**: `backend/plugins/qa-bot.ts` (created)

**Features:**
- ✅ Real-time question detection
- ✅ Context-aware answers
- ✅ Meeting history analysis
- ✅ Proactive help suggestions

**To Enable:**
```typescript
// In backend/api/transcription-service.ts
import { MeetingQABot } from '../plugins/qa-bot';

// In setupAudioProcessorListeners method:
if (this.isQuestion(transcriptLine.text)) {
  const answer = await this.qaBot?.processQuestion(sessionId, transcriptLine.text);
  // Broadcast answer via WebSocket
}
```

**API Usage:**
```bash
# Ask a question
POST /api/ai/question/{sessionId}
{
  "question": "What are the next steps?",
  "askedBy": "John Doe"
}
```

---

## **Step-by-Step Implementation** 🛠️

### **Step 1: Enable File Storage**

1. **Uncomment the imports** in `backend/api/transcription-service.ts`:
```typescript
import { TranscriptFileManager } from '../plugins/file-manager';
```

2. **Initialize the plugin**:
```typescript
constructor() {
  super();
  this.fileManager = new TranscriptFileManager();
}
```

3. **Enable auto-saving**:
```typescript
// In setupAudioProcessorListeners method
await this.fileManager?.appendTranscriptLine(sessionId, transcriptLine);
```

### **Step 2: Add Gemini AI Summarization**

1. **Install dependencies**:
```bash
npm install @google/generative-ai
```

2. **Set environment variable**:
```bash
# In .env file
GOOGLE_AI_API_KEY=your_gemini_api_key_here
```

3. **Uncomment the Gemini integration**:
```typescript
// In backend/plugins/gemini-processor.ts
this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
```

### **Step 3: Enable Q&A Bot**

1. **Uncomment the Q&A integration**:
```typescript
// In setupAudioProcessorListeners method
if (this.isQuestion(transcriptLine.text)) {
  const answer = await this.qaBot?.processQuestion(sessionId, transcriptLine.text);
  if (answer) {
    this.broadcastMessage({
      type: 'ai_response',
      payload: { question: transcriptLine.text, answer },
      timestamp: new Date()
    });
  }
}
```

---

## **Frontend Integration** 🖥️

### **Add AI Features to Dashboard**

Update `web/scripts/app.js` to handle new message types:

```javascript
// Handle AI responses
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'transcript':
      displayTranscript(message.payload);
      break;
      
    case 'ai_response':
      displayAIResponse(message.payload);
      break;
      
    case 'ai_summary':
      updateSummaryPanel(message.payload);
      break;
  }
});

function displayAIResponse(response) {
  const aiPanel = document.getElementById('ai-responses');
  const responseDiv = document.createElement('div');
  responseDiv.className = 'ai-response';
  responseDiv.innerHTML = `
    <strong>Q:</strong> ${response.question}<br>
    <strong>A:</strong> ${response.answer}
  `;
  aiPanel.appendChild(responseDiv);
}
```

### **Add UI Controls**

```html
<!-- Add to web/index.html -->
<div class="ai-controls">
  <button onclick="exportTranscript()">📄 Export Transcript</button>
  <button onclick="getSummary()">📊 Get Summary</button>
  <button onclick="askQuestion()">❓ Ask AI</button>
</div>

<div id="ai-responses" class="ai-panel">
  <h3>AI Responses</h3>
</div>
```

---

## **Testing Your Implementation** 🧪

### **1. Test File Export**
```bash
curl "http://localhost:3000/api/transcription/export/session-123/txt"
```

### **2. Test AI Summary**
```bash
curl "http://localhost:3000/api/ai/summary/session-123"
```

### **3. Test Q&A Bot**
```bash
curl -X POST "http://localhost:3000/api/ai/question/session-123" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the next steps?", "askedBy": "Test User"}'
```

---

## **Production Considerations** ⚡

### **Scalability**
- Use Redis for session storage across multiple server instances
- Implement rate limiting for AI API calls
- Add file storage cleanup jobs

### **Security**
- Encrypt transcript files at rest
- Implement proper authentication for AI features
- Rate limit API endpoints

### **Cost Optimization**
- Cache Gemini AI responses for similar questions
- Batch process transcript lines instead of real-time for summaries
- Implement usage tracking for AI features

---

## **Advanced Features** 🔮

### **Real-time Sentiment Analysis**
```typescript
// Add to GeminiAIProcessor
async analyzeSentiment(transcriptLine: TranscriptLine): Promise<string> {
  // Analyze tone, emotion, engagement level
}
```

### **Meeting Action Item Automation**
```typescript
// Add to file-manager.ts  
async createActionItemTasks(actionItems: string[]): Promise<void> {
  // Auto-create tasks in project management tools
}
```

### **Smart Meeting Insights**
```typescript
// Add to gemini-processor.ts
async generateMeetingReport(): Promise<{
  efficiency: number;
  participation: Record<string, number>;
  topics: string[];
  recommendations: string[];
}> {
  // Generate comprehensive meeting analytics
}
```

---

## **Need Help?** 🤝

The plugin architecture is designed to be modular and extensible. Each integration point is clearly marked with `🔧 INTEGRATION POINT` comments in the code.

**Key Files to Modify:**
- `backend/api/transcription-service.ts` - Main orchestration
- `backend/plugins/` - Your custom functionality
- `backend/server.ts` - API endpoints
- `web/scripts/app.js` - Frontend integration 