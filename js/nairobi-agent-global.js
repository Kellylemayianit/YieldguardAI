/* ========================================
   YIELDGUARD AI - GLOBAL NAIROBI AGENT
   js/nairobi-agent-global.js
   Handles agent modal across all pages
   ======================================== */

class GlobalNairobiAgent {
    constructor() {
        this.modal = null;
        this.input = null;
        this.triggerBtn = null;
        this.closeBtn = null;
        this.chatBox = null;
        this.sendBtn = null;
        this.isOpen = false;
        this.isProcessing = false;
    }

    /**
     * Initialize global agent modal
     */
    async initialize() {
        console.log('[Nairobi] Initializing global agent...');

        // Cache DOM elements
        this.modal = document.getElementById('agent-panel');
        this.input = document.getElementById('agent-input');
        this.triggerBtn = document.getElementById('trigger-nairobi');
        this.closeBtn = document.getElementById('close-agent');
        this.chatBox = document.getElementById('chat-messages');
        this.sendBtn = document.getElementById('send-message');

        if (!this.modal) {
            console.warn('[Nairobi] Agent panel not found in DOM');
            return false;
        }

        // Setup event listeners
        this._setupEventListeners();

        // Initialize with original NairobiAgent if available
        if (window.nairobi && typeof window.nairobi.initialize === 'function') {
            try {
                await window.nairobi.initialize();
                console.log('[Nairobi] Original nairobi-agent.js initialized');
            } catch (err) {
                console.warn('[Nairobi] Could not initialize nairobi-agent.js:', err);
            }
        }

        console.log('[Nairobi] Global agent initialized');
        return true;
    }

    /**
     * Setup all event listeners for agent modal
     */
    _setupEventListeners() {
        // Trigger button click (sidebar)
        if (this.triggerBtn) {
            this.triggerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleModal();
                console.log('[Nairobi] Toggled via trigger button');
            });
        }

        // Close button click
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeModal();
                console.log('[Nairobi] Closed via close button');
            });
        }

        // Backdrop click (outside modal)
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                // Only close if clicking directly on backdrop, not modal content
                if (e.target === this.modal) {
                    this.closeModal();
                    console.log('[Nairobi] Closed via backdrop click');
                }
            });
        }

        // Keyboard shortcuts - Global listener
        document.addEventListener('keydown', (e) => {
            // Ctrl+K or Cmd+K to toggle
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleModal();
                console.log('[Nairobi] Toggled via Ctrl+K');
            }

            // Escape to close
            if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.closeModal();
                console.log('[Nairobi] Closed via Escape');
            }
        });

        // Send button click
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleSendMessage();
            });
        }

        // Input Enter key
        if (this.input) {
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSendMessage();
                }
            });

            // Allow Shift+Enter for newlines
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                    // Default behavior: add newline
                    return;
                }
            });
        }
    }

    /**
     * Open modal
     */
    openModal() {
        if (!this.modal) return;

        this.modal.classList.remove('hidden');
        this.modal.classList.add('open');
        this.isOpen = true;

        // Focus input with slight delay for smooth UX
        if (this.input) {
            setTimeout(() => {
                this.input.focus();
            }, 100);
        }

        console.log('[Nairobi] Modal opened');
    }

    /**
     * Close modal
     */
    closeModal() {
        if (!this.modal) return;

        this.modal.classList.add('hidden');
        this.modal.classList.remove('open');
        this.isOpen = false;

        console.log('[Nairobi] Modal closed');
    }

    /**
     * Toggle modal open/close
     */
    toggleModal() {
        if (this.isOpen) {
            this.closeModal();
        } else {
            this.openModal();
        }
    }

    /**
     * Internal: Handle send message
     */
    async _handleSendMessage() {
        if (!this.input || !this.input.value.trim() || this.isProcessing) return;

        const message = this.input.value.trim();

        // Render user message
        this.renderMessage(message, true);
        this.input.value = '';

        // Show typing indicator
        this._showTypingIndicator();

        this.isProcessing = true;

        try {
            // Send via nairobi instance if available
            if (window.nairobi && typeof window.nairobi.sendMessage === 'function') {
                const response = await window.nairobi.sendMessage(message);
                this._removeTypingIndicator();
                if (response) {
                    this.renderMessage(response, false);
                    console.log('[Nairobi] Message sent and response received');
                }
            } else {
                // Fallback response if nairobi-agent.js not loaded
                this._removeTypingIndicator();
                const fallbackMsg = 'Hello! I am Nairobi, your DeFi risk advisor. I can help you analyze your positions, assess risk metrics, and optimize your exit strategies. What would you like to know?';
                this.renderMessage(fallbackMsg, false);
                console.log('[Nairobi] Using fallback response (nairobi-agent.js not available)');
            }
        } catch (err) {
            console.error('[Nairobi] Error sending message:', err);
            this._removeTypingIndicator();
            this.renderMessage('Sorry, I encountered an error processing your message. Please try again.', false);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Internal: Render message to chat
     */
    renderMessage(text, isUser = false) {
        if (!this.chatBox) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`;

        const bubble = document.createElement('div');
        if (isUser) {
            bubble.className = 'chat-user bg-green-500/20 border border-green-500/30 rounded-lg px-4 py-2 max-w-xs';
        } else {
            bubble.className = 'chat-agent bg-slate-800 rounded-lg px-4 py-2 max-w-xs';
        }

        const text_el = document.createElement('p');
        text_el.className = isUser ? 'text-sm text-green-300' : 'text-sm text-slate-300';
        text_el.textContent = text;
        text_el.style.wordWrap = 'break-word';
        text_el.style.overflowWrap = 'break-word';

        bubble.appendChild(text_el);
        msgDiv.appendChild(bubble);
        this.chatBox.appendChild(msgDiv);

        // Auto-scroll to bottom
        setTimeout(() => {
            if (this.chatBox) {
                this.chatBox.scrollTop = this.chatBox.scrollHeight;
            }
        }, 0);
    }

    /**
     * Internal: Show typing indicator
     */
    _showTypingIndicator() {
        if (!this.chatBox) return;

        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'flex justify-start';

        const bubble = document.createElement('div');
        bubble.className = 'bg-slate-800 rounded-lg px-4 py-2 flex gap-1';

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'w-2 h-2 bg-slate-500 rounded-full animate-bounce';
            dot.style.animationDelay = `${i * 0.1}s`;
            bubble.appendChild(dot);
        }

        typingDiv.appendChild(bubble);
        this.chatBox.appendChild(typingDiv);
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }

    /**
     * Internal: Remove typing indicator
     */
    _removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Public: Manually render a message (for external use)
     */
    addMessage(text, isUser = false) {
        this.renderMessage(text, isUser);
    }

    /**
     * Public: Clear chat messages
     */
    clearChat() {
        if (this.chatBox) {
            this.chatBox.innerHTML = '';
            const greeting = document.createElement('div');
            greeting.className = 'flex justify-start';
            const bubble = document.createElement('div');
            bubble.className = 'bg-slate-800 rounded-lg px-4 py-2 max-w-xs';
            const text_el = document.createElement('p');
            text_el.className = 'text-sm text-slate-300';
            text_el.textContent = "Hi! I'm Nairobi. Ask me about your positions or safety metrics.";
            bubble.appendChild(text_el);
            greeting.appendChild(bubble);
            this.chatBox.appendChild(greeting);
        }
        console.log('[Nairobi] Chat cleared');
    }

    /**
     * Public: Get current chat history from DOM
     */
    getChatHistory() {
        if (!this.chatBox) return [];
        
        const messages = [];
        const msgDivs = this.chatBox.querySelectorAll('> div:not(#typing-indicator)');
        
        msgDivs.forEach(msgDiv => {
            const isUser = msgDiv.classList.contains('justify-end');
            const text = msgDiv.textContent.trim();
            if (text) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    content: text
                });
            }
        });

        return messages;
    }
}

/* ==========================================
   GLOBAL INITIALIZATION
   ========================================== */

const globalNairobi = new GlobalNairobiAgent();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await globalNairobi.initialize();
    });
} else {
    globalNairobi.initialize();
}

// Export for external use
if (typeof window !== 'undefined') {
    window.globalNairobi = globalNairobi;
}

console.log('[Nairobi] Global agent script loaded');