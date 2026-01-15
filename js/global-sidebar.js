/* ========================================
   YIELDGUARD AI - GLOBAL SIDEBAR
   js/global-sidebar.js
   Handles sidebar navigation and active state
   ======================================== */

/**
 * Initialize global sidebar navigation
 */
function initializeGlobalSidebar() {
    // Detect current page based on URL
    const currentPage = getCurrentPage();
    
    // Set active state on navigation items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const page = item.dataset.page;
        
        if (page === currentPage) {
            item.classList.add('active');
            console.log(`[Sidebar] Set active state for: ${page}`);
        } else {
            item.classList.remove('active');
        }

        // Add click logging
        item.addEventListener('click', () => {
            console.log(`[Sidebar] Navigating to: ${page}`);
        });
    });

    console.log('[Sidebar] Initialized - Current page:', currentPage);
}

/**
 * Detect current page from URL
 */
function getCurrentPage() {
    const pathname = window.location.pathname;
    
    if (pathname.includes('dashboard')) return 'dashboard';
    if (pathname.includes('arbitrage')) return 'arbitrage';
    if (pathname.includes('reports')) return 'reports';
    if (pathname.includes('index') || pathname.endsWith('/')) return 'index';
    
    return 'index'; // Default to home
}

/**
 * Handle Ctrl+K shortcut for Nairobi Agent (Dashboard only)
 */
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+K or Cmd+K to open Nairobi Agent
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const agentPanel = document.getElementById('agent-panel');
            if (agentPanel) {
                const isOpen = agentPanel.classList.contains('open');
                if (isOpen) {
                    agentPanel.classList.remove('open');
                    console.log('[Keyboard] Nairobi Agent closed via Ctrl+K');
                } else {
                    agentPanel.classList.add('open');
                    document.getElementById('agent-input')?.focus();
                    console.log('[Keyboard] Nairobi Agent opened via Ctrl+K');
                }
            }
        }
    });
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeGlobalSidebar();
        initializeKeyboardShortcuts();
    });
} else {
    initializeGlobalSidebar();
    initializeKeyboardShortcuts();
}

// Export for modular use
if (typeof window !== 'undefined') {
    window.initializeGlobalSidebar = initializeGlobalSidebar;
    window.getCurrentPage = getCurrentPage;
}