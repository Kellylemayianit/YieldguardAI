/* ========================================
   YIELDGUARD AI - DASHBOARD PAGE
   js/dashboard-init.js
   Extracted event handlers from dashboard.html
   ======================================== */

/**
 * Initialize dashboard page interactions
 */
function initializeDashboard() {
    // Agent modal toggle - Open
    const openAgentBtn = document.getElementById('open-agent');
    if (openAgentBtn) {
        openAgentBtn.addEventListener('click', () => {
            const modal = document.getElementById('agent-panel');
            if (modal) {
                modal.classList.add('open');
                document.getElementById('agent-input')?.focus();
                console.log('[Dashboard] Nairobi command palette opened');
            }
        });
    }

    // Agent modal toggle - Close
    const closeAgentBtn = document.getElementById('close-agent');
    if (closeAgentBtn) {
        closeAgentBtn.addEventListener('click', () => {
            const modal = document.getElementById('agent-panel');
            if (modal) {
                modal.classList.remove('open');
                console.log('[Dashboard] Nairobi command palette closed');
            }
        });
    }

    // Close on background click
    const modal = document.getElementById('agent-panel');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
                console.log('[Dashboard] Nairobi command palette closed via backdrop');
            }
        });
    }

    // Send message handler
    const sendBtn = document.getElementById('send-message');
    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    }

    // Enter key to send (and Escape to close)
    const input = document.getElementById('agent-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                const modal = document.getElementById('agent-panel');
                if (modal) {
                    modal.classList.remove('open');
                    console.log('[Dashboard] Nairobi command palette closed via Escape');
                }
            }
        });
    }

    console.log('[Dashboard] Page initialized');
}

/**
 * Handle sending a message in the chat
 */
function handleSendMessage() {
    const input = document.getElementById('agent-input');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    const chatBox = document.getElementById('chat-messages');

    // Add user message to chat
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex justify-end';
    msgDiv.innerHTML = `<div class="bg-green-500/20 rounded-lg px-4 py-2 max-w-xs border border-green-500/30"><p class="text-sm text-green-300">${message}</p></div>`;
    chatBox?.appendChild(msgDiv);

    // Clear input
    input.value = '';

    // Auto-scroll to bottom
    setTimeout(() => {
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }, 0);

    // Send to Nairobi agent if available
    if (window.nairobi) {
        window.nairobi.sendMessage(message).then(response => {
            if (response) {
                window.nairobi.renderMessage(response, false);
            }
        });
    }

    console.log('[Dashboard] Message sent:', message);
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}

// Export for modular use
if (typeof window !== 'undefined') {
    window.initializeDashboard = initializeDashboard;
    window.handleSendMessage = handleSendMessage;
}