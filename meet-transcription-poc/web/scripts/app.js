// Meet Transcription Dashboard JavaScript

class TranscriptionDashboard {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.isConnected = false;
        this.startTime = null;
        this.durationInterval = null;
        this.transcriptCount = 0;
        
        // 🔧 NEW: AI Bot state
        this.aiBot = {
            enabled: false,
            responding: false,
            voiceCommands: ['hey ai', 'ai bot', 'ai summary', 'ai action items']
        };
        
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupEventListeners();
        this.updateConnectionStatus('connecting');
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsPort = 3001; // WebSocket port
        this.socket = new WebSocket(`${protocol}//${window.location.hostname}:${wsPort}`);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.updateConnectionStatus('connected');
        };

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.setupWebSocket(), 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('WebSocket connection failed');
        };
    }

    setupEventListeners() {
        // Session control buttons
        document.getElementById('startBtn').onclick = () => this.startTranscription();
        document.getElementById('stopBtn').onclick = () => this.stopTranscription();
        document.getElementById('exportBtn').onclick = () => this.exportTranscript();
        
        // 🔧 NEW: AI Bot controls
        document.getElementById('aiToggle').onchange = (e) => this.toggleAIBot(e.target.checked);
        
        // Manual question input
        const questionInput = document.getElementById('questionInput');
        questionInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                this.askManualQuestion();
            }
        };
    }

    handleWebSocketMessage(message) {
        console.log('Received message:', message.type);

        switch (message.type) {
            case 'transcript':
                this.handleTranscript(message.payload);
                break;
                
            case 'session_update':
                this.handleSessionUpdate(message.payload);
                break;
                
            case 'connection_status':
                this.handleConnectionStatus(message.payload);
                break;
                
            // 🔧 NEW: AI Bot message types
            case 'ai_response':
                this.handleAIResponse(message.payload);
                break;
                
            case 'ai_summary':
                this.handleAISummary(message.payload);
                break;
                
            case 'voice_command_detected':
                this.handleVoiceCommandDetected(message.payload);
                break;
                
            case 'error':
                this.showError(message.payload.message);
                break;
                
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    handleTranscript(transcript) {
        this.addTranscriptLine(transcript);
        this.transcriptCount++;
        
        // 🔧 NEW: Check for voice commands if AI bot is enabled
        if (this.aiBot.enabled && transcript.isFinal) {
            this.checkForVoiceCommands(transcript);
        }
    }

    handleSessionUpdate(payload) {
        this.updateParticipants(payload.participants);
        
        // Update session status if needed
        if (payload.status === 'active' && !this.sessionId) {
            this.sessionId = payload.sessionId || 'active-session';
            this.showSessionInfo();
        }
    }

    handleConnectionStatus(payload) {
        this.updateConnectionStatus(payload.status);
    }

    // 🔧 NEW: AI Bot methods
    toggleAIBot(enabled) {
        this.aiBot.enabled = enabled;
        
        const aiStatus = document.getElementById('aiStatus');
        const voiceCommands = document.getElementById('voiceCommands');
        const manualQuestion = document.getElementById('manualQuestion');
        const aiPanel = document.getElementById('aiPanel');
        
        if (enabled) {
            aiStatus.textContent = 'Enabled';
            aiStatus.classList.add('enabled');
            voiceCommands.style.display = 'block';
            manualQuestion.style.display = 'flex';
            aiPanel.style.display = 'flex';
            
            this.addAIMessage('🤖 AI Assistant enabled! You can now use voice commands or ask questions manually.');
        } else {
            aiStatus.textContent = 'Disabled';
            aiStatus.classList.remove('enabled');
            voiceCommands.style.display = 'none';
            manualQuestion.style.display = 'none';
            aiPanel.style.display = 'none';
        }
        
        // Update AI settings on server
        if (this.sessionId) {
            this.updateAISettings(enabled);
        }
    }

    checkForVoiceCommands(transcript) {
        const text = transcript.text.toLowerCase();
        
        // Check if transcript contains any voice commands
        const containsCommand = this.aiBot.voiceCommands.some(cmd => text.includes(cmd));
        
        if (containsCommand && !this.aiBot.responding) {
            this.handleVoiceCommand(transcript);
        }
    }

    async handleVoiceCommand(transcript) {
        const text = transcript.text.toLowerCase();
        this.aiBot.responding = true;
        
        // Show command detected indicator
        const commandDetected = document.getElementById('commandDetected');
        commandDetected.style.display = 'block';
        
        try {
            let question = transcript.text;
            
            // Extract question from command
            if (text.includes('hey ai') || text.includes('ai bot')) {
                // Remove the command prefix to get the actual question
                question = transcript.text.replace(/hey ai|ai bot/gi, '').trim();
                if (!question) {
                    question = 'Can you help me with this meeting?';
                }
            } else if (text.includes('ai summary')) {
                question = 'Please provide a summary of our discussion so far.';
            } else if (text.includes('ai action items')) {
                question = 'What are the action items from our discussion?';
            }
            
            // Send question to AI bot
            const response = await this.askAIQuestion(question, transcript.speaker.name);
            
            // Display the AI response
            this.displayAIResponse({
                question: question,
                answer: response.answer,
                askedBy: transcript.speaker.name,
                triggerType: 'voice_command'
            });
            
        } catch (error) {
            console.error('Error processing voice command:', error);
            this.addAIMessage('❌ Sorry, I had trouble processing that voice command.');
        } finally {
            this.aiBot.responding = false;
            commandDetected.style.display = 'none';
        }
    }

    async askManualQuestion() {
        const questionInput = document.getElementById('questionInput');
        const question = questionInput.value.trim();
        
        if (!question) {
            return;
        }
        
        if (!this.sessionId) {
            this.showError('Please start a transcription session first.');
            return;
        }
        
        try {
            questionInput.disabled = true;
            const response = await this.askAIQuestion(question, 'Dashboard User');
            
            this.displayAIResponse({
                question: question,
                answer: response.answer,
                askedBy: 'Dashboard User',
                triggerType: 'manual'
            });
            
            questionInput.value = '';
        } catch (error) {
            console.error('Error asking manual question:', error);
            this.showError('Failed to get AI response. Please try again.');
        } finally {
            questionInput.disabled = false;
        }
    }

    async askAIQuestion(question, askedBy) {
        const response = await fetch(`/api/ai/question/${this.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                askedBy: askedBy
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get AI response');
        }
        
        return await response.json();
    }

    async updateAISettings(enabled) {
        try {
            await fetch(`/api/ai/settings/${this.sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    enableQA: enabled,
                    enableSummary: enabled,
                    enableFileExport: true
                })
            });
        } catch (error) {
            console.error('Error updating AI settings:', error);
        }
    }

    handleAIResponse(payload) {
        this.displayAIResponse(payload);
    }

    handleAISummary(payload) {
        this.addAIMessage(`📊 **Meeting Summary Update:**\n${payload.summary}`);
    }

    handleVoiceCommandDetected(payload) {
        const commandDetected = document.getElementById('commandDetected');
        commandDetected.style.display = 'block';
        setTimeout(() => {
            commandDetected.style.display = 'none';
        }, 3000);
    }

    displayAIResponse(response) {
        const aiResponses = document.getElementById('aiResponses');
        
        // Remove placeholder if it exists
        const placeholder = aiResponses.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        const responseDiv = document.createElement('div');
        responseDiv.className = 'ai-response';
        
        const triggerIcon = response.triggerType === 'voice_command' ? '🎤' : '⌨️';
        
        responseDiv.innerHTML = `
            <div class="ai-question">
                ${triggerIcon} <strong>${response.askedBy}:</strong> ${response.question}
            </div>
            <div class="ai-answer">
                🤖 ${response.answer}
            </div>
            <div class="ai-meta">
                <span>Answered at ${new Date().toLocaleTimeString()}</span>
                <span>${response.triggerType === 'voice_command' ? 'Voice Command' : 'Manual'}</span>
            </div>
        `;
        
        aiResponses.appendChild(responseDiv);
        aiResponses.scrollTop = aiResponses.scrollHeight;
    }

    addAIMessage(message) {
        const aiResponses = document.getElementById('aiResponses');
        
        // Remove placeholder if it exists
        const placeholder = aiResponses.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-response';
        messageDiv.innerHTML = `
            <div class="ai-answer">${message}</div>
            <div class="ai-meta">
                <span>${new Date().toLocaleTimeString()}</span>
                <span>System</span>
            </div>
        `;
        
        aiResponses.appendChild(messageDiv);
        aiResponses.scrollTop = aiResponses.scrollHeight;
    }

    // Session management methods
    async startTranscription() {
        try {
            const meetingId = prompt('Enter Meeting Space ID:', 'spaces/example-meeting-id');
            if (!meetingId) return;
            
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const exportBtn = document.getElementById('exportBtn');
            
            startBtn.disabled = true;
            startBtn.textContent = '🔄 Starting...';
            
            const response = await fetch('/api/transcription/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meetingSpaceId: meetingId,
                    numberOfVideoStreams: 0,
                    enableAudioStreams: true,
                    accessToken: 'demo-token',
                    cloudProjectNumber: 'your-project-id'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.sessionId = result.sessionId;
                this.startTime = new Date();
                this.startDurationTimer();
                this.showSessionInfo();
                
                startBtn.style.display = 'none';
                stopBtn.disabled = false;
                exportBtn.disabled = false;
                
                // Enable AI toggle
                document.getElementById('aiToggle').disabled = false;
                
                this.addAIMessage('🚀 Transcription session started! AI features are now available.');
            } else {
                throw new Error(result.error || 'Failed to start transcription');
            }
        } catch (error) {
            console.error('Error starting transcription:', error);
            this.showError('Failed to start transcription: ' + error.message);
            
            const startBtn = document.getElementById('startBtn');
            startBtn.disabled = false;
            startBtn.textContent = '🚀 Start Transcription';
        }
    }

    async stopTranscription() {
        if (!this.sessionId) return;
        
        try {
            const stopBtn = document.getElementById('stopBtn');
            stopBtn.disabled = true;
            stopBtn.textContent = '🔄 Stopping...';
            
            const response = await fetch(`/api/transcription/stop/${this.sessionId}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.stopDurationTimer();
                this.sessionId = null;
                
                const startBtn = document.getElementById('startBtn');
                startBtn.style.display = 'block';
                startBtn.disabled = false;
                stopBtn.style.display = 'none';
                
                // Disable AI features
                this.toggleAIBot(false);
                document.getElementById('aiToggle').checked = false;
                document.getElementById('aiToggle').disabled = true;
                
                this.hideSessionInfo();
                this.addAIMessage('⏹️ Transcription session ended.');
            }
        } catch (error) {
            console.error('Error stopping transcription:', error);
            this.showError('Failed to stop transcription: ' + error.message);
        }
    }

    async exportTranscript(format = 'txt') {
        if (!this.sessionId) {
            this.showError('No active session to export.');
            return;
        }
        
        try {
            const response = await fetch(`/api/transcription/export/${this.sessionId}/${format}`);
            const result = await response.json();
            
            if (result.success) {
                // Create download link
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.download = `meeting-transcript-${this.sessionId}.${format}`;
                link.click();
                
                this.addAIMessage(`📄 Transcript exported as ${format.toUpperCase()} file.`);
            }
        } catch (error) {
            console.error('Error exporting transcript:', error);
            this.showError('Failed to export transcript.');
        }
    }

    // UI helper methods
    addTranscriptLine(transcript) {
        const container = document.getElementById('transcriptContainer');
        
        // Remove placeholder if it exists
        const placeholder = container.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        const transcriptItem = document.createElement('div');
        transcriptItem.className = `transcript-item ${transcript.isFinal ? 'final' : 'interim'}`;
        
        transcriptItem.innerHTML = `
            <div class="transcript-header">
                <span class="speaker-name">${transcript.speaker.name}</span>
                <span class="timestamp">${new Date(transcript.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="transcript-text">${transcript.text}</div>
        `;
        
        container.appendChild(transcriptItem);
        container.scrollTop = container.scrollHeight;
    }

    updateParticipants(participants) {
        const container = document.getElementById('participantsList');
        
        // Clear existing participants
        container.innerHTML = '';
        
        if (participants.length === 0) {
            container.innerHTML = '<p class="placeholder">Waiting for participants...</p>';
            return;
        }
        
        participants.forEach(participant => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant-item';
            
            const initials = participant.name.split(' ').map(n => n[0]).join('').toUpperCase();
            
            participantDiv.innerHTML = `
                <div class="participant-avatar">${initials}</div>
                <div class="participant-info">
                    <div class="participant-name">${participant.name}</div>
                    <div class="participant-role">${participant.role}</div>
                </div>
            `;
            
            container.appendChild(participantDiv);
        });
    }

    updateConnectionStatus(status) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusIndicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
            case 'disconnected':
                statusText.textContent = 'Disconnected';
                break;
        }
    }

    showSessionInfo() {
        const sessionInfo = document.getElementById('sessionInfo');
        const sessionIdSpan = document.getElementById('currentSessionId');
        const startTimeSpan = document.getElementById('sessionStartTime');
        
        sessionInfo.style.display = 'flex';
        sessionIdSpan.textContent = this.sessionId;
        startTimeSpan.textContent = this.startTime.toLocaleString();
    }

    hideSessionInfo() {
        document.getElementById('sessionInfo').style.display = 'none';
    }

    startDurationTimer() {
        this.durationInterval = setInterval(() => {
            if (this.startTime) {
                const duration = new Date() - this.startTime;
                const minutes = Math.floor(duration / 60000);
                const seconds = Math.floor((duration % 60000) / 1000);
                document.getElementById('sessionDuration').textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopDurationTimer() {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
    }

    showError(message) {
        const errorContainer = document.getElementById('errorContainer');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        errorContainer.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.dismissError();
        }, 5000);
    }

    dismissError() {
        document.getElementById('errorContainer').style.display = 'none';
    }
}

// Global functions for HTML onclick handlers
function toggleAIBot(enabled) {
    window.dashboard.toggleAIBot(enabled);
}

function askManualQuestion() {
    window.dashboard.askManualQuestion();
}

function startTranscription() {
    window.dashboard.startTranscription();
}

function stopTranscription() {
    window.dashboard.stopTranscription();
}

function exportTranscript() {
    window.dashboard.exportTranscript();
}

function dismissError() {
    window.dashboard.dismissError();
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TranscriptionDashboard();
});
