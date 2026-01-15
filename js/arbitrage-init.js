/* ========================================
   YIELDGUARD AI - ARBITRAGE PAGE
   js/arbitrage-init.js
   Extracted event handlers from arbitrage.html
   ======================================== */

/**
 * Initialize arbitrage page interactions
 */
function initializeArbitrage() {
    // Calculate button handler
    const calculateBtn = document.getElementById('calculate-btn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', handleCalculateExit);
    }

    // Execute exit button
    const executeBtn = document.getElementById('execute-exit');
    if (executeBtn) {
        executeBtn.addEventListener('click', () => {
            const amount = document.getElementById('exit-amount')?.value;
            console.log('[Arbitrage] Execute exit clicked for amount:', amount);
            if (window.exitOptimizer) {
                const txData = window.exitOptimizer.prepareUniswapTransaction(
                    parseFloat(amount),
                    document.getElementById('asset-type')?.value,
                    '0x...' // User wallet address
                );
                console.log('[Arbitrage] Transaction prepared:', txData);
                alert(`Executing exit of ${amount} on Uniswap V4...\n\n(This will connect to your wallet integration)`);
            }
        });
    }

    // Wait button
    const waitBtn = document.getElementById('wait-btn');
    if (waitBtn) {
        waitBtn.addEventListener('click', () => {
            console.log('[Arbitrage] Wait for redemption clicked');
            alert('You\'ve chosen to wait for the 7-day redemption window. Good luck!');
        });
    }

    console.log('[Arbitrage] Page initialized');
}

/**
 * Handle calculate exit button click
 */
function handleCalculateExit() {
    const assetType = document.getElementById('asset-type')?.value;
    const amount = parseFloat(document.getElementById('exit-amount')?.value);
    
    if (isNaN(amount) || amount <= 0) {
        console.warn('[Arbitrage] Invalid amount entered');
        alert('Please enter a valid amount');
        return;
    }

    console.log('[Arbitrage] Calculating exit for', amount, assetType);

    // Call exit-optimizer.js if available
    if (window.exitOptimizer) {
        window.exitOptimizer.calculateExit(assetType, amount)
            .then(result => {
                if (result.success) {
                    console.log('[Arbitrage] Calculation successful:', result);
                    // Data automatically rendered to UI by exit-optimizer.js
                } else {
                    console.error('[Arbitrage] Calculation failed:', result.error);
                    alert('Calculation failed: ' + result.error);
                }
            })
            .catch(err => {
                console.error('[Arbitrage] Error during calculation:', err);
                alert('Error: ' + err.message);
            });
    } else {
        // Fallback for when exit-optimizer not loaded
        console.warn('[Arbitrage] exit-optimizer.js not loaded');
        alert('Exit optimizer initializing - please try again');
    }
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeArbitrage);
} else {
    initializeArbitrage();
}

// Export for modular use
if (typeof window !== 'undefined') {
    window.initializeArbitrage = initializeArbitrage;
    window.handleCalculateExit = handleCalculateExit;
}