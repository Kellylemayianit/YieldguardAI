/* ========================================
   YIELDGUARD AI - NAIROBI INTELLIGENCE
   nairobi-agent.js
   Manages AI agent, context, memory, chat UI
   ======================================== */

class NairobiAgent {
    constructor(config = {}) {
        this.n8nBaseUrl = config.n8nUrl || 'https://your-n8n-instance.com';
        this.airtableApiKey = config.airtableKey;
        this.airtableBaseId = config.airtableBaseId;
        this.aiModel = config.aiModel || 'gemini-pro'; // or 'gpt-4'
        this.conversationHistory = [];
        this.userWatchlist = [];
        this.userProfile = {};
        this.isProcessing = false;
        this.maxContextTokens = 4000;
    }

    /* ==========================================
       1. CONTEXT PREPARATION
       ========================================== */

    /**
     * Fetch user's Watchlist from Airtable
     */
    async fetchUserWatchlist() {
        if (!this.airtableApiKey || !this.airtableBaseId) {
            console.warn('[Nairobi] Airtable credentials not configured');
            return [];
        }

        try {
            const response = await fetch(
                `https://api.airtable.com/v0/${this.airtableBaseId}/Watchlist`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.airtableApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
            
            const data = await response.json();
            this.userWatchlist = data.records.map(r => r.fields);
            
            console.log('[Nairobi] Watchlist fetched:', this.userWatchlist);
            return this.userWatchlist;
        } catch (error) {
            console.error('[Nairobi] Watchlist fetch failed:', error);
            return [];
        }
    }

    /**
     * Fetch user's Profile & Memory from Airtable
     */
    async fetchUserProfile() {
        if (!this.airtableApiKey || !this.airtableBaseId) {
            console.warn('[Nairobi] Airtable credentials not configured');
            return {};
        }

        try {
            const response = await fetch(
                `https://api.airtable.com/v0/${this.airtableBaseId}/UserProfile`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.airtableApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`Profile fetch error: ${response.status}`);
            
            const data = await response.json();
            this.userProfile = data.records[0]?.fields || {};
            
            console.log('[Nairobi] Profile fetched:', this.userProfile);
            return this.userProfile;
        } catch (error) {
            console.error('[Nairobi] Profile fetch failed:', error);
            return {};
        }
    }

    /**
     * Build system context for AI agent
     */
    buildSystemContext() {
        const watchlistSummary = this.userWatchlist
            .map(item => `- ${item.Protocol}: ${item.Amount}`)
            .join('\n');

        const systemPrompt = `You are Nairobi, an expert DeFi risk advisor for YieldGuard AI. You monitor Ethena (sUSDe), Falcon (LST), and Pendle (yield tokens).

USER CONTEXT:
- Risk Profile: ${this.userProfile.RiskTolerance || 'Moderate'}
- Total Exposure: $${this.userProfile.TotalExposure || '0'}
- Location: ${this.userProfile.Location || 'Unknown'}

CURRENT WATCHLIST:
${watchlistSummary || 'No positions tracked'}

INSTRUCTIONS:
1. Always provide specific, actionable advice based on their positions
2. Reference the PulseScore when discussing risk (0-100 scale, 75+ is Safe)
3. Warn about de-peg risks for sUSDe exposure
4. Check cooldown windows for Falcon positions (7-day lock-up)
5. Alert if Pendle maturity is approaching (<7 days)
6. Use KES/USD pricing context when user is in Kenya
7. Be concise but thorough - prioritize actionable insights

TONE: Professional but approachable. Confident but humble about limitations.`;

        return systemPrompt;
    }

    /* ==========================================
       2. MESSAGE HANDLING
       ========================================== */

    /**
     * Send user message to AI via n8n
     */
    async sendMessage(userMessage) {
        if (this.isProcessing) {
            console.warn('[Nairobi] Already processing a message');
            return null;
        }

        try {
            this.isProcessing = true;
            console.log('[Nairobi] Sending message:', userMessage);

            // Add to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userMessage,
                timestamp: new Date().toISOString()
            });

            // Build context-aware prompt
            const systemContext = this.buildSystemContext();
            
            // Call n8n webhook for AI processing
            const response = await fetch(`${this.n8nBaseUrl}/webhook/nairobi-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userMessage: userMessage,
                    systemContext: systemContext,
                    conversationHistory: this._trimHistory(),
                    watchlist: this.userWatchlist,
                    userProfile: this.userProfile,
                    model: this.aiModel,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`Agent error: ${response.status}`);
            
            const data = await response.json();
            const agentResponse = data.response || data.message || 'No response from agent';

            // Add response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: agentResponse,
                timestamp: new Date().toISOString()
            });

            console.log('[Nairobi] Response:', agentResponse);
            
            return agentResponse;

        } catch (error) {
            console.error('[Nairobi] Message send failed:', error);
            return `Error: Unable to process your request. ${error.message}`;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Trim conversation history to fit token limit
     */
    _trimHistory(maxMessages = 10) {
        // Keep last N messages to respect token limits
        return this.conversationHistory.slice(-maxMessages);
    }

    /* ==========================================
       3. CHAT UI MANAGEMENT
       ========================================== */

    /**
     * Render message to chat panel
     */
    renderMessage(text, isUser = false) {
        const chatBox = document.getElementById('chat-messages');
        if (!chatBox) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

        const messageBubble = document.createElement('div');
        messageBubble.className = isUser 
            ? 'bg-green-500/20 border border-green-500/30 rounded-lg px-4 py-2 max-w-xs'
            : 'bg-slate-800 rounded-lg px-4 py-2 max-w-xs';

        const messageText = document.createElement('p');
        messageText.className = isUser ? 'text-sm text-green-300' : 'text-sm text-slate-300';
        messageText.textContent = text;

        messageBubble.appendChild(messageText);
        messageDiv.appendChild(messageBubble);
        chatBox.appendChild(messageDiv);

        // Auto-scroll to bottom
        setTimeout(() => {
            chatBox.scrollTop = chatBox.scrollHeight;
        }, 0);
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const chatBox = document.getElementById('chat-messages');
        if (!chatBox) return;

        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'flex justify-start';

        const typingBubble = document.createElement('div');
        typingBubble.className = 'bg-slate-800 rounded-lg px-4 py-2 flex gap-1';

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'w-2 h-2 bg-slate-500 rounded-full animate-bounce';
            dot.style.animationDelay = `${i * 0.1}s`;
            typingBubble.appendChild(dot);
        }

        typingDiv.appendChild(typingBubble);
        chatBox.appendChild(typingDiv);

        chatBox.scrollTop = chatBox.scrollHeight;
    }

    /**
     * Remove typing indicator
     */
    removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    /* ==========================================
       4. UI EVENT HANDLERS
       ========================================== */

    /**
     * Initialize chat panel event listeners
     */
    initializeChatUI() {
        const sendBtn = document.getElementById('send-message');
        const input = document.getElementById('agent-input');

        if (sendBtn && input) {
            sendBtn.addEventListener('click', () => this._handleSendClick(input));
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSendClick(input);
                }
            });
        }

        // Initialize panel toggles
        const openBtn = document.getElementById('open-agent');
        const closeBtn = document.getElementById('close-agent');
        const panel = document.getElementById('agent-panel');

        if (openBtn && closeBtn && panel) {
            openBtn.addEventListener('click', () => {
                panel.classList.add('open');
                input?.focus();
            });
            closeBtn.addEventListener('click', () => panel.classList.remove('open'));
        }

        console.log('[Nairobi] Chat UI initialized');
    }

    /**
     * Internal: Handle send button click
     */
    async _handleSendClick(inputEl) {
        const message = inputEl.value.trim();
        if (!message) return;

        // Render user message
        this.renderMessage(message, true);
        inputEl.value = '';

        // Show typing indicator
        this.showTypingIndicator();

        // Get agent response
        const response = await this.sendMessage(message);
        this.removeTypingIndicator();

        // Render agent response
        if (response) {
            this.renderMessage(response, false);
        }
    }

    /* ==========================================
       5. STARTUP & INITIALIZATION
       ========================================== */

    /**
     * Initialize agent - fetch data and setup UI
     */
    async initialize() {
        try {
            console.log('[Nairobi] Initializing...');

            // Fetch user data in parallel
            await Promise.all([
                this.fetchUserWatchlist(),
                this.fetchUserProfile()
            ]);

            // Setup UI
            this.initializeChatUI();

            // Load conversation history from storage (optional)
            this._loadConversationHistory();

            console.log('[Nairobi] Initialization complete');
            return true;
        } catch (error) {
            console.error('[Nairobi] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Internal: Load saved conversation history
     */
    _loadConversationHistory() {
        try {
            const saved = localStorage.getItem('nairobi_history');
            if (saved) {
                this.conversationHistory = JSON.parse(saved);
                console.log('[Nairobi] Conversation history loaded');
            }
        } catch (error) {
            console.warn('[Nairobi] Could not load history:', error);
        }
    }

    /**
     * Save conversation history
     */
    saveConversationHistory() {
        try {
            localStorage.setItem('nairobi_history', JSON.stringify(this.conversationHistory));
            console.log('[Nairobi] History saved');
        } catch (error) {
            console.warn('[Nairobi] Could not save history:', error);
        }
    }

    /**
     * Clear conversation and memory
     */
    clearConversation() {
        this.conversationHistory = [];
        this.saveConversationHistory();
        
        const chatBox = document.getElementById('chat-messages');
        if (chatBox) chatBox.innerHTML = '';
        
        console.log('[Nairobi] Conversation cleared');
    }
}

/* ==========================================
   EXPORT & INITIALIZATION
   ========================================== */

const nairobi = new NairobiAgent({
    n8nUrl: process.env.N8N_URL || 'https://your-n8n-instance.com',
    airtableKey: process.env.AIRTABLE_KEY,
    airtableBaseId: process.env.AIRTABLE_BASE_ID,
    aiModel: 'gemini-pro'
});

// Auto-initialize on page load if agent panel exists
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (document.getElementById('agent-panel')) {
            await nairobi.initialize();
        }
    });
} else {
    if (document.getElementById('agent-panel')) {
        nairobi.initialize();
    }
}

// Save history before unload
window.addEventListener('beforeunload', () => {
    nairobi.saveConversationHistory();
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.nairobi = nairobi;
}