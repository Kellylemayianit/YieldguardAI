/* ========================================
   YIELDGUARD AI - COMPLIANCE & REPORTING
   audit-manager.js
   Handles tax exports, cost-basis, KRA reports
   ======================================== */

class AuditManager {
    constructor(config = {}) {
        this.airtableApiKey = config.airtableKey;
        this.airtableBaseId = config.airtableBaseId;
        this.n8nBaseUrl = config.n8nUrl || 'https://your-n8n-instance.com';
        this.userLocation = config.userLocation || 'KE'; // Kenya default
        this.exchangeRates = {};
        this.yieldLogs = [];
        this.currentFilter = 'all';
    }

    /* ==========================================
       1. DATA FETCHING FROM AIRTABLE
       ========================================== */

    /**
     * Fetch all yield logs from Airtable "Memory"
     */
    async fetchYieldLogs(filter = 'all') {
        if (!this.airtableApiKey || !this.airtableBaseId) {
            console.warn('[AuditManager] Airtable credentials not configured');
            return [];
        }

        try {
            let filterFormula = '';
            
            // Build filter based on date range
            if (filter === 'current-month') {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                filterFormula = `?filterByFormula=AND(IS_AFTER({Timestamp},'${startOfMonth.toISOString()}'))`;
            } else if (filter === 'last-quarter') {
                const now = new Date();
                const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));
                filterFormula = `?filterByFormula=AND(IS_AFTER({Timestamp},'${threeMonthsAgo.toISOString()}'))`;
            } else if (filter === 'last-year') {
                const now = new Date();
                const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
                filterFormula = `?filterByFormula=AND(IS_AFTER({Timestamp},'${oneYearAgo.toISOString()}'))`;
            }

            const response = await fetch(
                `https://api.airtable.com/v0/${this.airtableBaseId}/YieldLogs${filterFormula}`,
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
            this.yieldLogs = data.records.map(r => ({
                id: r.id,
                ...r.fields
            }));

            console.log('[AuditManager] Yield logs fetched:', this.yieldLogs.length, 'records');
            return this.yieldLogs;

        } catch (error) {
            console.error('[AuditManager] Yield logs fetch failed:', error);
            return [];
        }
    }

    /* ==========================================
       2. CURRENCY CONVERSION
       ========================================== */

    /**
     * Fetch historical exchange rates from n8n
     */
    async fetchExchangeRate(asset, timestamp) {
        try {
            const response = await fetch(`${this.n8nBaseUrl}/webhook/exchange-rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: asset,
                    currency: this.userLocation === 'KE' ? 'KES' : 'USD',
                    timestamp: timestamp,
                    action: 'get_rate_at_time'
                })
            });

            if (!response.ok) throw new Error(`Exchange rate error: ${response.status}`);
            
            const data = await response.json();
            
            return {
                asset: asset,
                rate: parseFloat(data.rate),
                currency: data.currency,
                timestamp: timestamp,
                source: data.source || 'Binance'
            };
        } catch (error) {
            console.error('[AuditManager] Exchange rate fetch failed:', error);
            return {
                asset: asset,
                rate: 1.0, // Fallback
                currency: this.userLocation === 'KE' ? 'KES' : 'USD',
                timestamp: timestamp,
                source: 'Fallback'
            };
        }
    }

    /**
     * Convert reward amount to local currency
     */
    async convertToCurrency(amount, asset, timestamp) {
        const rate = await this.fetchExchangeRate(asset, timestamp);
        return {
            amountCrypto: amount,
            asset: asset,
            amountLocal: amount * rate.rate,
            rate: rate.rate,
            currency: rate.currency,
            timestamp: timestamp
        };
    }

    /* ==========================================
       3. TAX CALCULATION
       ========================================== */

    /**
     * Calculate cost-basis for a yield event
     */
    calculateCostBasis(yieldLog) {
        // Timestamp is when reward was received - that's the acquisition date
        const acquisitionDate = yieldLog.Timestamp;
        const acquisitionRate = parseFloat(yieldLog.ExchangeRate) || 1.0;
        const amountCrypto = parseFloat(yieldLog.RewardAmount);

        const costBasisLocal = amountCrypto * acquisitionRate;

        return {
            acquisitionDate: acquisitionDate,
            acquisitionRate: acquisitionRate,
            amountCrypto: amountCrypto,
            costBasisLocal: costBasisLocal,
            currency: yieldLog.Currency || this.userLocation === 'KE' ? 'KES' : 'USD'
        };
    }

    /**
     * Calculate tax liability (simplified 30% effective rate for Kenya)
     */
    calculateTaxLiability(costBasisLocal) {
        const taxRate = this.userLocation === 'KE' ? 0.30 : 0.20; // Kenya 30%, default 20%
        return costBasisLocal * taxRate;
    }

    /* ==========================================
       4. CSV EXPORT
       ========================================== */

    /**
     * Generate CSV file for tax export
     */
    async generateTaxCSV(currency = 'KES') {
        try {
            console.log('[AuditManager] Generating CSV in', currency);

            // Prepare rows
            const csvRows = [
                ['Timestamp', 'Asset', 'Protocol', 'Reward Amount (Crypto)', `Value at Receipt (${currency})`, 'Exchange Rate', 'Tax Liability', 'Risk Score at Time']
            ];

            // Process each yield log
            for (const log of this.yieldLogs) {
                const timestamp = log.Timestamp;
                const asset = log.Asset;
                const protocol = log.Protocol;
                const amount = parseFloat(log.RewardAmount);
                const exchangeRate = parseFloat(log.ExchangeRate) || 1.0;
                
                const valueLocal = amount * exchangeRate;
                const taxLiability = this.calculateTaxLiability(valueLocal);
                const riskScore = log.RiskScore || 'N/A';

                csvRows.push([
                    timestamp,
                    asset,
                    protocol,
                    amount.toFixed(8),
                    valueLocal.toFixed(2),
                    exchangeRate.toFixed(4),
                    taxLiability.toFixed(2),
                    riskScore
                ]);
            }

            // Generate CSV string
            const csv = csvRows.map(row => 
                row.map(cell => {
                    // Escape quotes and wrap in quotes if contains comma
                    const escaped = String(cell).replace(/"/g, '""');
                    return escaped.includes(',') ? `"${escaped}"` : escaped;
                }).join(',')
            ).join('\n');

            console.log('[AuditManager] CSV generated:', csv.length, 'bytes');
            return csv;

        } catch (error) {
            console.error('[AuditManager] CSV generation failed:', error);
            return null;
        }
    }

    /**
     * Trigger download of CSV file
     */
    downloadCSV(csvContent, filename = null) {
        if (!csvContent) {
            console.error('[AuditManager] No CSV content to download');
            return;
        }

        const defaultName = `yieldguard-tax-export-${new Date().toISOString().split('T')[0]}.csv`;
        const name = filename || defaultName;

        // Create blob
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', name);
        link.style.visibility = 'hidden';
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[AuditManager] Download triggered:', name);
    }

    /* ==========================================
       5. TABLE RENDERING & FILTERING
       ========================================== */

    /**
     * Render yield logs to HTML table
     */
    renderTable(logs = null) {
        const logsToRender = logs || this.yieldLogs;
        const tableBody = document.querySelector('table tbody');
        
        if (!tableBody) {
            console.warn('[AuditManager] Table body not found');
            return;
        }

        // Clear existing rows
        tableBody.innerHTML = '';

        // Add each log as a row
        logsToRender.forEach(log => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-800/50 transition';
            row.innerHTML = `
                <td class="px-6 py-4 text-slate-300">${log.Timestamp}</td>
                <td class="px-6 py-4 text-slate-300">${log.Asset}</td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">${log.Protocol}</span>
                </td>
                <td class="px-6 py-4 table-cell-number text-green-400 font-semibold">${parseFloat(log.RewardAmount).toFixed(8)}</td>
                <td class="px-6 py-4 table-cell-number text-slate-300">${(parseFloat(log.RewardAmount) * parseFloat(log.ExchangeRate)).toFixed(0)} ${log.Currency || 'KES'}</td>
                <td class="px-6 py-4 table-cell-number text-slate-400 text-xs">${parseFloat(log.ExchangeRate).toFixed(4)}</td>
                <td class="px-6 py-4 table-cell-number text-green-400 font-semibold">${log.RiskScore || 'N/A'}</td>
                <td class="px-6 py-4 text-center">
                    <button class="text-slate-400 hover:text-green-400 transition" title="View details">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m0 0V3a2 2 0 00-2-2h-2a2 2 0 00-2 2v2z"></path>
                        </svg>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Update record count
        const countEl = document.querySelector('[data-record-count]');
        if (countEl) {
            countEl.textContent = logsToRender.length;
        }

        console.log('[AuditManager] Table rendered:', logsToRender.length, 'rows');
    }

    /**
     * Apply filter to yield logs
     */
    filterLogs(filterType) {
        this.currentFilter = filterType;

        let filtered = this.yieldLogs;

        if (filterType === 'current-month') {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = this.yieldLogs.filter(log => new Date(log.Timestamp) >= startOfMonth);
        } else if (filterType === 'last-quarter') {
            const now = new Date();
            const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));
            filtered = this.yieldLogs.filter(log => new Date(log.Timestamp) >= threeMonthsAgo);
        } else if (filterType === 'last-year') {
            const now = new Date();
            const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
            filtered = this.yieldLogs.filter(log => new Date(log.Timestamp) >= oneYearAgo);
        }

        this.renderTable(filtered);
        console.log('[AuditManager] Applied filter:', filterType, 'Result:', filtered.length);
    }

    /**
     * Filter by protocol
     */
    filterByProtocol(protocol) {
        let filtered = this.yieldLogs;

        if (protocol) {
            filtered = this.yieldLogs.filter(log => log.Protocol === protocol);
        }

        this.renderTable(filtered);
        console.log('[AuditManager] Filtered by protocol:', protocol, 'Result:', filtered.length);
    }

    /* ==========================================
       6. INITIALIZATION & UI WIRING
       ========================================== */

    /**
     * Initialize audit manager UI and handlers
     */
    initializeUI() {
        // Download CSV button
        const downloadBtn = document.getElementById('download-csv');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                const currency = prompt('Choose export currency: KES or USD?', 'KES').toUpperCase();
                if (currency === 'KES' || currency === 'USD') {
                    const csv = await this.generateTaxCSV(currency);
                    this.downloadCSV(csv, `yieldguard-tax-export-${currency}-${new Date().toISOString().split('T')[0]}.csv`);
                }
            });
        }

        // Time-based filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterLogs(e.target.dataset.filter);
            });
        });

        // Protocol filter dropdown
        const protocolFilter = document.getElementById('protocol-filter');
        if (protocolFilter) {
            protocolFilter.addEventListener('change', (e) => {
                this.filterByProtocol(e.target.value);
            });
        }

        console.log('[AuditManager] UI initialized');
    }

    /**
     * Complete initialization flow
     */
    async initialize() {
        try {
            console.log('[AuditManager] Initializing...');

            // Fetch yield logs
            await this.fetchYieldLogs('all');

            // Render table
            this.renderTable();

            // Setup UI handlers
            this.initializeUI();

            console.log('[AuditManager] Initialization complete');
            return true;
        } catch (error) {
            console.error('[AuditManager] Initialization failed:', error);
            return false;
        }
    }
}

/* ==========================================
   EXPORT & INITIALIZATION
   ========================================== */

const auditManager = new AuditManager({
    airtableKey: process.env.AIRTABLE_KEY,
    airtableBaseId: process.env.AIRTABLE_BASE_ID,
    n8nUrl: process.env.N8N_URL || 'https://your-n8n-instance.com',
    userLocation: 'KE' // Default to Kenya
});

// Auto-initialize on reports page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        if (document.querySelector('table tbody')) {
            await auditManager.initialize();
        }
    });
} else {
    if (document.querySelector('table tbody')) {
        auditManager.initialize();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.auditManager = auditManager;
}