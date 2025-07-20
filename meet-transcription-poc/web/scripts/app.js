class MeetTranscriptionApp {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.participants = new Map();
        this.transcriptLines = [];
        this.sessionStartTime = null;
        this.durationTimer = null;
        
        this.initializeElements();
        this.bindEvents();
        this.updateConnectionStatus(false);
    }
    
    initializeElements() {
        // Connection elements
        this.authBtn = document.getElementById('auth-btn');
        this.connectBtn = document.getElementById('connect-btn');
        this.connectionForm = document.getElementById('connection-form');
        this.meetingIdInput = document.getElementById('meeting-id');
        
        // Status elements
        this.connectionIndicator = document.getElementById('connection-indicator');
        this.participantCount = document.getElementById('participant-count');
        this.sessionDuration = document.getElementById('session-duration');
        this.transcriptCount = document.getElementById('transcript-count');
        this.audioQuality = document.getElementById('audio-quality');
        
        // Content elements
        this.participantsList = document.getElementById('participants-list');
        this.transcriptContainer = document.getElementById('transcript-container');
        
        // Control elements
        this.clearTranscriptBtn = document.getElementById('clear-transcript');
        this.downloadTranscriptBtn = document.getElementById('download-transcript');
        
        // Overlay elements
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingMessage = document.getElementById('loading-message');
        this.toastContainer = document.getElementById('toast-container');
    }
    
    bindEvents() {
        this.authBtn.addEventListener('click', () => this.handleAuth());
        this.connectionForm.addEventListener('submit', (e) => this.handleConnect(e));
        this.clearTranscriptBtn.addEventListener('click', () => this.clearTranscript());
        this.downloadTranscriptBtn.addEventListener('click', () => this.downloadTranscript());
        
        // Handle browser close/refresh
        window.addEventListener('beforeunload', () => {
            if (this.ws) {
                this.ws.close();
            }
        });
    }
    
    async handleAuth() {
        try {
            this.showLoading('Authenticating with Google...');
            
            const response = await fetch('/auth/url');
            const data = await response.json();
            
            if (data.authUrl) {
                window.open(data.authUrl, 'auth', 'width=500,height=600');
                
                // Listen for auth completion
                const checkAuth = setInterval(async () => {
                    const authCheck = await fetch('/auth/status');
                    const authData = await authCheck.json();
                    
                    if (authData.authenticated) {
                        clearInterval(checkAuth);
                        this.hideLoading();
                        this.connectBtn.disabled = false;
                        this.showToast('Authentication successful!', 'success');
                    }
                }, 1000);
                
                // Timeout after 2 minutes
                setTimeout(() => {
                    clearInterval(checkAuth);
                    this.hideLoading();
                    this.showToast('Authentication timeout', 'error');
                }, 120000);
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.hideLoading();
            this.showToast('Authentication failed', 'error');
        }
    }
    
    async handleConnect(e) {
        e.preventDefault();
        
        const meetingId = this.meetingIdInput.value.trim();
        if (!meetingId) {
            this.showToast('Please enter a meeting ID', 'warning');
            return;
        }
        
        try {
            this.showLoading('Connecting to meeting...');
            
            // Initialize WebSocket connection
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                
                // Send connection request
                this.ws.send(JSON.stringify({
                    type: 'connect',
                    meetingId: meetingId
                }));
            };
            
            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.updateConnectionStatus(false);
                this.hideLoading();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.hideLoading();
                this.showToast('Connection failed', 'error');
            };
            
        } catch (error) {
            console.error('Connection error:', error);
            this.hideLoading();
            this.showToast('Failed to connect to meeting', 'error');
        }
    }
    
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'connection_status':
                this.handleConnectionStatus(message.payload);
                break;
            case 'session_update':
                this.handleSessionUpdate(message.payload);
                break;
            case 'transcript':
                this.handleTranscriptLine(message.payload);
                break;
            case 'error':
                this.showToast(message.payload.message, 'error');
                break;
        }
    }
    
    handleConnectionStatus(status) {
        this.isConnected = status.status === 'connected';
        this.updateConnectionStatus(this.isConnected);
        
        if (this.isConnected) {
            this.hideLoading();
            this.sessionStartTime = new Date();
            this.startDurationTimer();
            this.showToast('Connected to meeting!', 'success');
        } else {
            this.stopDurationTimer();
        }
    }
    
    handleSessionUpdate(session) {
        this.participants.clear();
        session.participants.forEach(participant => {
            this.participants.set(participant.id, participant);
        });
        
        this.updateParticipantsList();
        this.updateAudioQuality('Good'); // Mock for now
    }
    
    handleTranscriptLine(line) {
        this.transcriptLines.push(line);
        this.addTranscriptLine(line);
        this.updateTranscriptCount();
    }
    
    addTranscriptLine(line) {
        const transcriptLine = document.createElement('div');
        transcriptLine.className = `transcript-line ${line.speaker.role}`;
        if (!line.isFinal) {
            transcriptLine.classList.add('interim');
        }
        
        transcriptLine.innerHTML = `
            <div class="transcript-speaker">
                ${line.speaker.name}
                <span class="transcript-timestamp">${new Date(line.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="transcript-text">${line.text}</div>
        `;
        
        // Remove empty state if present
        const emptyState = this.transcriptContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        this.transcriptContainer.appendChild(transcriptLine);
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }
    
    updateConnectionStatus(connected) {
        this.connectionIndicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
        this.connectionIndicator.innerHTML = `
            <i class="fas fa-circle"></i>
            ${connected ? 'Connected' : 'Disconnected'}
        `;
    }
    
    updateParticipantsList() {
        if (this.participants.size === 0) {
            this.participantsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>No participants connected</p>
                </div>
            `;
            this.participantCount.textContent = '0';
            return;
        }
        
        this.participantsList.innerHTML = '';
        this.participants.forEach(participant => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant-item';
            
            const initials = participant.name.split(' ').map(n => n[0]).join('').toUpperCase();
            
            participantElement.innerHTML = `
                <div class="participant-avatar">${initials}</div>
                <div class="participant-info">
                    <h4>${participant.name}</h4>
                    <p>${participant.role.replace('_', ' ')}</p>
                </div>
                <div class="participant-status speaking">Speaking</div>
            `;
            
            this.participantsList.appendChild(participantElement);
        });
        
        this.participantCount.textContent = this.participants.size.toString();
    }
    
    updateTranscriptCount() {
        const finalLines = this.transcriptLines.filter(line => line.isFinal).length;
        this.transcriptCount.textContent = `${finalLines} lines`;
    }
    
    updateAudioQuality(quality) {
        this.audioQuality.textContent = quality;
    }
    
    startDurationTimer() {
        this.durationTimer = setInterval(() => {
            if (this.sessionStartTime) {
                const elapsed = Date.now() - this.sessionStartTime.getTime();
                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                this.sessionDuration.textContent = 
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }
    
    stopDurationTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
            this.durationTimer = null;
        }
    }
    
    clearTranscript() {
        this.transcriptLines = [];
        this.transcriptContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-microphone-slash"></i>
                <p>Waiting for audio streams...</p>
            </div>
        `;
        this.updateTranscriptCount();
        this.showToast('Transcript cleared', 'success');
    }
    
    downloadTranscript() {
        if (this.transcriptLines.length === 0) {
            this.showToast('No transcript to download', 'warning');
            return;
        }
        
        const finalLines = this.transcriptLines.filter(line => line.isFinal);
        const transcriptText = finalLines.map(line => {
            const timestamp = new Date(line.timestamp).toLocaleTimeString();
            return `[${timestamp}] ${line.speaker.name}: ${line.text}`;
        }).join('\n');
        
        const blob = new Blob([transcriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-transcript-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Transcript downloaded', 'success');
    }
    
    showLoading(message) {
        this.loadingMessage.textContent = message;
        this.loadingOverlay.classList.remove('hidden');
    }
    
    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                ${message}
            </div>
        `;
        
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MeetTranscriptionApp();
});
