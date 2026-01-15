/* ========================================
   YIELDGUARD AI - LIQUIDITY & ARBITRAGE
   exit-optimizer.js
   Compares Redemption vs Market Value
   Calculates Liquidity Gain & Exit Strategy
   ======================================== */

class ExitOptimizer {
    constructor(config = {}) {
        this.n8nBaseUrl = config.n8nUrl || 'https://your-n8n-instance.com';
        this.slippageEstimate = config.slippageEstimate || 0.004; // 0.4%
        this.gasEstimate = config.gasEstimate || 5; // USD
        this.dailyYieldRate = config.dailyYieldRate || 0.024; // ~2.4% APY / 365
        this.depegRiskScenarios = {
            best: 0,        // No de-peg
            mid: 0.005,     // 0.5% de-peg
            worst: 0.02     // 2% de-peg
        };
    }

    /* ==========================================
       1. INPUT HANDLING
       ========================================== */

    /**
     * Parse user input from calculator
     */
    parseUserInput(assetType, amount) {
        return {
            asset: assetType.toUpperCase(),
            amount: parseFloat(amount),
            timestamp: new Date().toISOString()
        };
    }

    /* ==========================================
       2. PRICE FETCHING
       ========================================== */

    /**
     * Fetch current NAV (Redemption Value) for protocol
     */
    async fetchRedemptionValue(asset) {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/redemption-value`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: asset,
                    action: 'fetch_nav',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`NAV fetch error: ${response.status}`);
            
            const data = await response.json();
            console.log(`[ExitOptimizer] Redemption NAV for ${asset}:`, data);
            
            return {
                asset: asset,
                nav: parseFloat(data.nav) || 1.0,
                cooldownDays: parseFloat(data.cooldownDays) || 7,
                unlockDate: data.unlockDate,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ExitOptimizer] Redemption fetch failed:', error);
            return null;
        }
    }

    /**
     * Fetch current market price from DEX (via n8n)
     */
    async fetchMarketPrice(asset) {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/market-price`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: asset,
                    dex: 'uniswap-v4',
                    action: 'fetch_price',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`Market price error: ${response.status}`);
            
            const data = await response.json();
            console.log(`[ExitOptimizer] Market price for ${asset}:`, data);
            
            return {
                asset: asset,
                price: parseFloat(data.price) || 1.0,
                liquidity: parseFloat(data.liquidity),
                dex: data.dex,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ExitOptimizer] Market price fetch failed:', error);
            return null;
        }
    }

    /* ==========================================
       3. COMPARISON ENGINE
       ========================================== */

    /**
     * Calculate Redemption Path (waiting 7 days)
     */
    calculateRedemptionPath(amount, redemptionData) {
        const nav = redemptionData.nav;
        const cooldownDays = redemptionData.cooldownDays;
        
        // Calculate yield accrued during cooldown
        const yieldAccrued = amount * this.dailyYieldRate * cooldownDays;
        
        return {
            strategy: 'Redemption (Cooldown)',
            amount: amount,
            nav: nav,
            finalValue: amount * nav + yieldAccrued,
            yieldAccrued: yieldAccrued,
            haircut: 0,
            fees: 0,
            cooldownDays: cooldownDays,
            timeToLiquidity: `${cooldownDays} days`,
            risks: [
                'De-peg exposure during lock-up',
                'Opportunity cost of capital',
                'Potential protocol changes'
            ]
        };
    }

    /**
     * Calculate Market Path (instant DEX swap)
     */
    calculateMarketPath(amount, marketData) {
        const price = marketData.price;
        
        // Slippage loss
        const slippageLoss = amount * price * this.slippageEstimate;
        
        // Final value after slippage and gas
        const finalValue = (amount * price) - slippageLoss - this.gasEstimate;
        
        return {
            strategy: 'Instant Liquidity (DEX)',
            amount: amount,
            price: price,
            finalValue: finalValue,
            slippageLoss: slippageLoss,
            gasEstimate: this.gasEstimate,
            totalCost: slippageLoss + this.gasEstimate,
            haircut: (this.slippageEstimate * 100).toFixed(2),
            timeToLiquidity: '2-5 minutes',
            dex: marketData.dex,
            liquidity: marketData.liquidity,
            risks: [
                'DEX slippage impact',
                'Gas fee volatility',
                'Smart contract risk'
            ]
        };
    }

    /* ==========================================
       4. LIQUIDITY GAIN METRIC
       ========================================== */

    /**
     * Calculate capital efficiency gain by exiting early
     */
    calculateLiquidityGain(redemptionPath, marketPath) {
        const cooldownHours = redemptionPath.cooldownDays * 24;
        
        // Cost-benefit analysis
        const redemptionValue = redemptionPath.finalValue;
        const marketValue = marketPath.finalValue;
        const netDifference = redemptionValue - marketValue;
        
        // If market is better by factor of capital efficiency
        const recommendation = netDifference > 0 ? 'WAIT' : 'EXIT_NOW';
        
        return {
            liquidityGainHours: cooldownHours,
            timeUnit: 'hours',
            netDifference: netDifference,
            percentDifference: ((netDifference / redemptionValue) * 100).toFixed(2),
            recommendation: recommendation,
            breakeven: {
                depegPercent: this._calculateBreakeven(redemptionPath, marketPath),
                description: 'De-peg % that makes waiting equal to exiting'
            },
            analysis: {
                bestCase: this._scenarioAnalysis(redemptionPath, marketPath, 'best'),
                midCase: this._scenarioAnalysis(redemptionPath, marketPath, 'mid'),
                worstCase: this._scenarioAnalysis(redemptionPath, marketPath, 'worst')
            }
        };
    }

    /**
     * Internal: Calculate breakeven de-peg percentage
     */
    _calculateBreakeven(redemptionPath, marketPath) {
        const marketValue = marketPath.finalValue;
        const costOfWaiting = redemptionPath.yieldAccrued || 0;
        const costOfExiting = marketPath.totalCost;
        
        // Breakeven = where NAV de-peg equals exit cost difference
        const breakeven = (costOfExiting - costOfWaiting) / redemptionPath.amount;
        return (Math.abs(breakeven) * 100).toFixed(2);
    }

    /**
     * Internal: Scenario analysis for different de-peg levels
     */
    _scenarioAnalysis(redemptionPath, marketPath, scenario) {
        const depegRisk = this.depegRiskScenarios[scenario];
        const redemptionValue = redemptionPath.amount * (1 - depegRisk) + redemptionPath.yieldAccrued;
        const marketValue = marketPath.finalValue;
        
        return {
            scenario: scenario.charAt(0).toUpperCase() + scenario.slice(1),
            depegPercent: (depegRisk * 100).toFixed(2),
            redemptionValue: redemptionValue.toFixed(2),
            marketValue: marketValue.toFixed(2),
            recommendation: redemptionValue > marketValue ? 'WAIT' : 'EXIT_NOW',
            gainLoss: (redemptionValue - marketValue).toFixed(2)
        };
    }

    /* ==========================================
       5. DOM UPDATES
       ========================================== */

    /**
     * Render comparison view to HTML
     */
    renderComparison(input, redemptionPath, marketPath, liquidityGain) {
        console.log('[ExitOptimizer] Rendering comparison...', {
            input,
            redemption: redemptionPath,
            market: marketPath,
            liquidity: liquidityGain
        });

        // Update Redemption (Left) side
        this._updateRedemptionCard(redemptionPath);
        
        // Update Market (Right) side
        this._updateMarketCard(marketPath);
        
        // Update Liquidity Gain badge
        this._updateLiquidityBadge(liquidityGain);
        
        // Update scenario table
        this._updateScenarioTable(liquidityGain.analysis);

        // Emit event for other modules
        window.dispatchEvent(new CustomEvent('exitComparison', { 
            detail: { input, redemptionPath, marketPath, liquidityGain } 
        }));
    }

    /**
     * Internal: Update left card (Redemption)
     */
    _updateRedemptionCard(redemptionPath) {
        const daysEl = document.querySelector('[data-redemption-days]');
        const navEl = document.querySelector('[data-redemption-nav]');
        const yieldEl = document.querySelector('[data-redemption-yield]');

        if (daysEl) daysEl.textContent = redemptionPath.cooldownDays;
        if (navEl) navEl.textContent = `$${redemptionPath.finalValue.toFixed(2)}`;
        if (yieldEl) yieldEl.textContent = `$${redemptionPath.yieldAccrued.toFixed(2)}/day`;
    }

    /**
     * Internal: Update right card (Market)
     */
    _updateMarketCard(marketPath) {
        const priceEl = document.querySelector('[data-market-price]');
        const haircutEl = document.querySelector('[data-market-haircut]');
        const finalEl = document.querySelector('[data-market-final]');

        if (priceEl) priceEl.textContent = `$${marketPath.finalValue.toFixed(2)}`;
        if (haircutEl) haircutEl.textContent = `${marketPath.haircut}%`;
        if (finalEl) finalEl.textContent = `$${marketPath.finalValue.toFixed(2)}`;
    }

    /**
     * Internal: Update Liquidity Gain badge
     */
    _updateLiquidityBadge(liquidityGain) {
        const badgeEl = document.getElementById('liquidity-badge');
        if (!badgeEl) return;

        const gainHours = liquidityGain.liquidityGainHours;
        const recommendation = liquidityGain.recommendation;
        const pct = liquidityGain.percentDifference;

        const gainText = badgeEl.querySelector('h2 span:nth-child(2)');
        if (gainText) ganText.textContent = `${gainHours} Hours`;

        const recEl = badgeEl.querySelector('[data-recommendation]');
        if (recEl) recEl.textContent = recommendation === 'EXIT_NOW' ? 'Exit Now' : 'Wait';

        console.log('[ExitOptimizer] Updated liquidity badge:', gainHours, recommendation);
    }

    /**
     * Internal: Update scenario table
     */
    _updateScenarioTable(analysis) {
        const table = document.querySelector('[data-scenario-table]');
        if (!table) return;

        const rows = [analysis.bestCase, analysis.midCase, analysis.worstCase];
        const tableRows = table.querySelectorAll('tbody tr');

        rows.forEach((scenario, idx) => {
            if (!tableRows[idx]) return;
            const cells = tableRows[idx].querySelectorAll('td');
            if (cells.length >= 4) {
                cells[1].textContent = scenario.redemptionValue;
                cells[2].textContent = scenario.marketValue;
                cells[3].textContent = scenario.recommendation;
            }
        });
    }

    /* ==========================================
       6. TRANSACTION PREPARATION
       ========================================== */

    /**
     * Prepare Uniswap V4 swap transaction
     */
    prepareUniswapTransaction(amount, asset, walletAddress) {
        return {
            dex: 'uniswap-v4',
            operation: 'EXACT_INPUT_SWAP',
            tokenIn: asset,
            tokenOut: 'USDC', // or user preference
            amountIn: amount,
            minAmountOut: amount * 0.995, // 0.5% slippage tolerance
            recipient: walletAddress,
            deadline: Math.floor(Date.now() / 1000) + 300, // 5 min
            payload: {
                asset: asset,
                amount: amount,
                slippagePercent: 0.5,
                gasEstimate: this.gasEstimate
            }
        };
    }

    /**
     * Execute exit (stub - connects to wallet)
     */
    async executeExit(transactionData, walletConnector) {
        try {
            console.log('[ExitOptimizer] Preparing exit transaction:', transactionData);
            
            // This would integrate with wallet (MetaMask, etc)
            if (!walletConnector) {
                throw new Error('Wallet connector not available');
            }

            const txHash = await walletConnector.sendTransaction(transactionData);
            
            console.log('[ExitOptimizer] Exit executed:', txHash);
            
            return {
                success: true,
                txHash: txHash,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ExitOptimizer] Exit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /* ==========================================
       7. CALCULATOR FLOW
       ========================================== */

    /**
     * Main calculation flow - called from UI
     */
    async calculateExit(assetType, amount) {
        try {
            console.log('[ExitOptimizer] Starting calculation:', { assetType, amount });

            // 1. Parse input
            const input = this.parseUserInput(assetType, amount);

            // 2. Fetch data in parallel
            const [redemptionData, marketData] = await Promise.all([
                this.fetchRedemptionValue(assetType),
                this.fetchMarketPrice(assetType)
            ]);

            if (!redemptionData || !marketData) {
                throw new Error('Failed to fetch market data');
            }

            // 3. Calculate both paths
            const redemptionPath = this.calculateRedemptionPath(amount, redemptionData);
            const marketPath = this.calculateMarketPath(amount, marketData);

            // 4. Calculate liquidity gain
            const liquidityGain = this.calculateLiquidityGain(redemptionPath, marketPath);

            // 5. Render to UI
            this.renderComparison(input, redemptionPath, marketPath, liquidityGain);

            return {
                success: true,
                input,
                redemptionPath,
                marketPath,
                liquidityGain
            };

        } catch (error) {
            console.error('[ExitOptimizer] Calculation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/* ==========================================
   EXPORT & INITIALIZATION
   ========================================== */

const exitOptimizer = new ExitOptimizer({
    n8nUrl: process.env.N8N_URL || 'https://your-n8n-instance.com',
    slippageEstimate: 0.004,
    gasEstimate: 5,
    dailyYieldRate: 0.024
});

// Wire up calculate button
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const calculateBtn = document.getElementById('calculate-btn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', async () => {
                const assetType = document.getElementById('asset-type')?.value;
                const amount = document.getElementById('exit-amount')?.value;
                if (assetType && amount) {
                    await exitOptimizer.calculateExit(assetType, amount);
                }
            });
        }
    });
} else {
    const calculateBtn = document.getElementById('calculate-btn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', async () => {
            const assetType = document.getElementById('asset-type')?.value;
            const amount = document.getElementById('exit-amount')?.value;
            if (assetType && amount) {
                await exitOptimizer.calculateExit(assetType, amount);
            }
        });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.exitOptimizer = exitOptimizer;
}