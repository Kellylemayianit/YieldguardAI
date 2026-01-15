/* ========================================
   YIELDGUARD AI - LANDING PAGE
   js/index-init.js
   Extracted event handlers from index.html
   ======================================== */

/**
 * Initialize landing page event listeners
 */
function initializeLandingPage() {
    // Launch Terminal Button
    const launchBtn = document.getElementById('launch-terminal');
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            console.log('[Landing] Launch Terminal clicked');
            window.location.href = 'dashboard.html';
        });
    }

    // CTA Launch Button
    const ctaBtn = document.getElementById('cta-launch');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
            console.log('[Landing] Start Monitoring clicked');
            window.location.href = 'dashboard.html';
        });
    }

    // Connect Wallet Button
    const walletBtn = document.getElementById('connect-wallet');
    if (walletBtn) {
        walletBtn.addEventListener('click', () => {
            console.log('[Landing] Wallet connection initiated');
            alert('Wallet connection coming soon - connects to Web3 provider');
        });
    }

    // Share to Farcaster Button
    const shareBtn = document.getElementById('share-farcaster');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            console.log('[Landing] Share to Farcaster triggered');
            // This will integrate with social-share.js module
            if (window.socialShare) {
                window.socialShare.captureAndShare('farcaster');
            } else {
                alert('Share functionality initializing - will connect to social-share.js');
            }
        });
    }

    console.log('[Index] Landing page initialized');
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLandingPage);
} else {
    initializeLandingPage();
}

// Export for modular use
if (typeof window !== 'undefined') {
    window.initializeLandingPage = initializeLandingPage;
}