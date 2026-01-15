/* ========================================
   YIELDGUARD AI - RISK & YIELD ENGINE
   risk-core.js
   Fetches real-time APY, funding rates, cooldowns
   Calculates PulseScore and updates dashboard
   ======================================== */

class RiskCoreEngine {
    constructor(config = {}) {
        this.n8nBaseUrl = config.n8nUrl || 'https://your-n8n-instance.com';
        this.airtableApiKey = config.airtableKey;
        this.airtableBaseId = config.airtableBaseId;
        this.pollingInterval = config.pollingInterval || 30000; // 30s default
        this.activeWatchlist = [];
        this.lastPulseScores = {};
        this.isPolling = false;
    }

    /* ==========================================
       1. DATA INGESTION FROM N8N WEBHOOKS
       ========================================== */

    /**
     * Fetch Pendle V2 APY data via n8n
     */
    async fetchPendleAPY() {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/pendle-apy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'fetch_current_apy',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`Pendle API error: ${response.status}`);
            
            const data = await response.json();
            console.log('[RiskCore] Pendle APY fetched:', data);
            
            return {
                protocol: 'Pendle',
                apy: parseFloat(data.apy),
                maturityDate: data.maturityDate,
                confidence: data.confidence || 0.95,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[RiskCore] Pendle fetch failed:', error);
            return null;
        }
    }

    /**
     * Fetch Ethena funding rates via n8n
     */
    async fetchEthenaFundingRate() {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/ethena-funding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'fetch_funding_rate',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`Ethena API error: ${response.status}`);
            
            const data = await response.json();
            console.log('[RiskCore] Ethena funding rate fetched:', data);
            
            return {
                protocol: 'Ethena',
                fundingRate: parseFloat(data.fundingRate),
                apy: parseFloat(data.apy),
                depegRisk: parseFloat(data.depegRisk) || 0.01,
                lastUpdate: data.lastUpdate,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[RiskCore] Ethena fetch failed:', error);
            return null;
        }
    }

    /**
     * Fetch Falcon cooldown state via n8n
     */
    async fetchFalconCooldown() {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/falcon-cooldown`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'fetch_cooldown_state',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`Falcon API error: ${response.status}`);
            
            const data = await response.json();
            console.log('[RiskCore] Falcon cooldown fetched:', data);
            
            return {
                protocol: 'Falcon',
                cooldownDays: parseFloat(data.cooldownDays),
                cooldownEndDate: data.cooldownEndDate,
                apy: parseFloat(data.apy),
                lockupExpiration: data.lockupExpiration,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[RiskCore] Falcon fetch failed:', error);
            return null;
        }
    }

    /* ==========================================
       2. PULSESCORE CALCULATION (0-100)
       ========================================== */

    /**
     * Calculate PulseScore based on three factors:
     * - Temporal Risk (cooldown windows)
     * - De-Peg Deviation (price stability)
     * - Liveness (protocol health)
     */
    calculatePulseScore(protocolData) {
        let score = 100; // Start at max

        if (!protocolData) return 0;

        // Factor 1: Temporal Risk (0-30 points)
        // Penalizes shorter cooldown windows and approaching maturity
        if (protocolData.protocol === 'Pendle') {
            const daysToMaturity = this._daysUntilDate(protocolData.maturityDate);
            if (daysToMaturity < 1) score -= 30;
            else if (daysToMaturity < 3) score -= 20;
            else if (daysToMaturity < 7) score -= 10;
        }

        if (protocolData.protocol === 'Falcon') {
            const cooldownDays = protocolData.cooldownDays;
            if (cooldownDays < 3) score -= 25;
            else if (cooldownDays < 5) score -= 15;
            else if (cooldownDays < 7) score -= 5;
        }

        // Factor 2: De-Peg Deviation (0-35 points)
        // Penalizes funding rate instability and de-peg risk
        if (protocolData.protocol === 'Ethena') {
            const fundingRate = Math.abs(protocolData.fundingRate);
            const depegRisk = protocolData.depegRisk || 0.01;

            if (fundingRate > 0.05) score -= 20; // High positive funding
            else if (fundingRate > 0.02) score -= 10;

            if (depegRisk > 0.02) score -= 15; // >2% de-peg risk
            else if (depegRisk > 0.01) score -= 8;
        }

        // Factor 3: Liveness (0-35 points)
        // Assumes confidence/health metric is provided
        if (protocolData.confidence !== undefined) {
            const confidence = protocolData.confidence;
            if (confidence < 0.8) score -= 30;
            else if (confidence < 0.9) score -= 15;
            else if (confidence < 0.95) score -= 5;
        }

        // Clamp between 0-100
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get status label and color based on score
     */
    getStatusFromScore(score) {
        if (score >= 75) {
            return { status: 'Safe', color: 'text-green-400', indicator: 'status-safe' };
        } else if (score >= 50) {
            return { status: 'Monitor', color: 'text-yellow-400', indicator: 'status-warning' };
        } else if (score >= 25) {
            return { status: 'Warning', color: 'text-orange-500', indicator: 'status-warning' };
        } else {
            return { status: 'Critical', color: 'text-red-500', indicator: 'status-critical' };
        }
    }

    /* ==========================================
       3. DOM UPDATES - SYNC TO HTML
       ========================================== */

    /**
     * Update PulseTicker on index.html
     */
    updatePulseTicker(data) {
        const ticker = document.getElementById('pulse-ticker');
        if (!ticker) return;

        // Create ticker items from protocol data
        const items = [];
        
        if (data.pendle) {
            items.push(`Pendle: <span class="text-green-400 font-semibold">${data.pendle.apy?.toFixed(2)}%</span> APR`);
        }
        if (data.ethena) {
            items.push(`Ethena: <span class="text-green-400 font-semibold">${data.ethena.apy?.toFixed(2)}%</span> APR`);
        }
        if (data.falcon) {
            items.push(`Falcon: <span class="text-yellow-400 font-semibold">${data.falcon.apy?.toFixed(2)}%</span> APR`);
        }

        console.log('[RiskCore] Updating PulseTicker:', items);
        // Ticker scroll handled by CSS animation
    }

    /**
     * Update PulseScore cards on dashboard.html
     */
    updatePulseScoreCards(scores) {
        const pulseCards = {
            'ethena': document.querySelector('[data-protocol="ethena"]'),
            'falcon': document.querySelector('[data-protocol="falcon"]'),
            'pendle': document.querySelector('[data-protocol="pendle"]')
        };

        Object.entries(scores).forEach(([protocol, score]) => {
            const card = document.querySelector(`[data-protocol="${protocol}"]`);
            if (!card) return;

            const scoreValue = this.calculatePulseScore(score);
            this.lastPulseScores[protocol] = scoreValue;
            
            const status = this.getStatusFromScore(scoreValue);
            const progressPercent = (scoreValue / 100) * 100;

            // Update score number
            const scoreEl = card.querySelector('[data-score]');
            if (scoreEl) {
                scoreEl.textContent = scoreValue;
                scoreEl.className = `font-semibold ${status.color}`;
            }

            // Update progress bar
            const progressBar = card.querySelector('.risk-progress-inner');
            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
                progressBar.className = `h-full transition-all duration-300 risk-progress-${status.indicator.split('-')[1]}`;
            }

            // Update status indicator
            const statusIndicator = card.querySelector('[data-status]');
            if (statusIndicator) {
                statusIndicator.textContent = status.status;
                statusIndicator.className = `text-xs ${status.color}`;
            }

            // Update pulse dot color
            const pulseDot = card.querySelector('.pulse-indicator');
            if (pulseDot) {
                pulseDot.className = `w-3 h-3 rounded-full pulse-indicator ${status.color.replace('text-', 'bg-')}`;
            }

            console.log(`[RiskCore] Updated ${protocol} card: score=${scoreValue}, status=${status.status}`);
        });
    }

    /**
     * Update global PulseScore gauge on landing page
     */
    updateGlobalScore(scores) {
        const globalScoreEl = document.getElementById('global-score');
        if (!globalScoreEl) return;

        // Calculate average across protocols
        const values = Object.values(scores);
        const avgScore = values.length > 0 
            ? Math.round(values.reduce((a, b) => a + this.calculatePulseScore(b), 0) / values.length)
            : 0;

        const status = this.getStatusFromScore(avgScore);
        const arcPercent = (avgScore / 100) * 283; // Circle circumference

        // Find SVG circle element
        const circle = globalScoreEl.querySelector('circle[stroke="#22c55e"]');
        if (circle) {
            circle.setAttribute('stroke-dasharray', `${arcPercent} ${376.8 - arcPercent}`);
            circle.setAttribute('stroke', this._getHexColor(status.color));
        }

        // Update score text
        const scoreText = globalScoreEl.querySelector('text:nth-of-type(1)');
        if (scoreText) {
            scoreText.textContent = avgScore;
            scoreText.setAttribute('fill', this._getHexColor(status.color));
        }

        const statusText = globalScoreEl.querySelector('text:nth-of-type(2)');
        if (statusText) {
            statusText.textContent = status.status;
            statusText.setAttribute('fill', this._getHexColor(status.color));
        }

        console.log('[RiskCore] Updated global score:', avgScore);
    }

    /* ==========================================
       4. AIRTABLE SYNC - WATCHLIST UPDATES
       ========================================== */

    /**
     * Push user watchlist changes to Airtable
     */
    async syncWatchlistToAirtable(watchlist) {
        if (!this.airtableApiKey || !this.airtableBaseId) {
            console.warn('[RiskCore] Airtable credentials not configured');
            return;
        }

        try {
            const response = await fetch(
                `https://api.airtable.com/v0/${this.airtableBaseId}/Watchlist`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.airtableApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        records: watchlist.map(item => ({
                            fields: {
                                Protocol: item.protocol,
                                Amount: item.amount,
                                DateAdded: new Date().toISOString(),
                                Status: 'Active'
                            }
                        }))
                    })
                }
            );

            if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
            
            const data = await response.json();
            console.log('[RiskCore] Watchlist synced to Airtable:', data);
            return data;
        } catch (error) {
            console.error('[RiskCore] Airtable sync failed:', error);
            return null;
        }
    }

    /* ==========================================
       5. MONITORING LOOP - CONTINUOUS POLLING
       ========================================== */

    /**
     * Start continuous polling of all protocols
     */
    async startMonitoringLoop() {
        if (this.isPolling) {
            console.warn('[RiskCore] Monitoring loop already active');
            return;
        }

        this.isPolling = true;
        console.log('[RiskCore] Starting monitoring loop...');

        const poll = async () => {
            try {
                // Fetch all protocol data in parallel
                const [pendle, ethena, falcon] = await Promise.all([
                    this.fetchPendleAPY(),
                    this.fetchEthenaFundingRate(),
                    this.fetchFalconCooldown()
                ]);

                const data = { pendle, ethena, falcon };

                // Update UI
                this.updatePulseTicker(data);
                this.updatePulseScoreCards(data);
                this.updateGlobalScore(data);

                // Emit event for other modules
                window.dispatchEvent(new CustomEvent('pulseScoreUpdate', { detail: data }));

            } catch (error) {
                console.error('[RiskCore] Poll cycle failed:', error);
            }

            // Schedule next poll
            if (this.isPolling) {
                setTimeout(poll, this.pollingInterval);
            }
        };

        // Initial poll immediately
        poll();
    }

    /**
     * Stop monitoring loop
     */
    stopMonitoringLoop() {
        this.isPolling = false;
        console.log('[RiskCore] Monitoring loop stopped');
    }

    /* ==========================================
       6. UTILITY FUNCTIONS
       ========================================== */

    _daysUntilDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = date - now;
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    _getHexColor(tailwindColor) {
        const colorMap = {
            'text-green-400': '#22c55e',
            'text-yellow-400': '#eab308',
            'text-orange-500': '#f97316',
            'text-red-500': '#ef4444'
        };
        return colorMap[tailwindColor] || '#22c55e';
    }
}

/* ==========================================
   EXPORT & INITIALIZE
   ========================================== */

const riskCore = new RiskCoreEngine({
    n8nUrl: process.env.N8N_URL || 'https://your-n8n-instance.com',
    airtableKey: process.env.AIRTABLE_KEY,
    airtableBaseId: process.env.AIRTABLE_BASE_ID,
    pollingInterval: 30000
});

// Auto-start on page load if in dashboard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('pulse-tower')) {
            riskCore.startMonitoringLoop();
        }
    });
} else {
    if (document.getElementById('pulse-tower')) {
        riskCore.startMonitoringLoop();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.riskCore = riskCore;
}