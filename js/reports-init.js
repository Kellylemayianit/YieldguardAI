/* ========================================
   YIELDGUARD AI - REPORTS PAGE
   js/reports-init.js
   Extracted event handlers from reports.html
   ======================================== */

/**
 * Initialize reports page interactions
 */
function initializeReports() {
    // Filter button handlers
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filterType = btn.dataset.filter;
            console.log('[Reports] Filtered by:', filterType);
            
            // Call audit-manager.js if available
            if (window.auditManager) {
                window.auditManager.filterLogs(filterType);
            }
        });
    });

    // Download CSV handler
    const downloadBtn = document.getElementById('download-csv');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownloadCSV);
    }

    // Protocol filter handler
    const protocolFilter = document.getElementById('protocol-filter');
    if (protocolFilter) {
        protocolFilter.addEventListener('change', (e) => {
            const protocol = e.target.value;
            console.log('[Reports] Filtering by protocol:', protocol);
            
            // Call audit-manager.js if available
            if (window.auditManager) {
                window.auditManager.filterByProtocol(protocol);
            }
        });
    }

    console.log('[Reports] Page initialized');
}

/**
 * Handle CSV download
 */
function handleDownloadCSV() {
    const currency = prompt('Choose export currency: KES or USD?', 'KES').toUpperCase();
    
    if (currency !== 'KES' && currency !== 'USD') {
        console.warn('[Reports] Invalid currency selected');
        return;
    }

    console.log('[Reports] Generating', currency, 'tax export...');

    // Call audit-manager.js if available
    if (window.auditManager) {
        window.auditManager.generateTaxCSV(currency)
            .then(csv => {
                if (csv) {
                    const filename = `yieldguard-tax-export-${currency}-${new Date().toISOString().split('T')[0]}.csv`;
                    window.auditManager.downloadCSV(csv, filename);
                    console.log('[Reports] CSV generated and downloaded:', filename);
                } else {
                    console.error('[Reports] CSV generation failed');
                    alert('CSV generation failed. Please try again.');
                }
            })
            .catch(err => {
                console.error('[Reports] Error during CSV generation:', err);
                alert('Error: ' + err.message);
            });
    } else {
        // Fallback for when audit-manager not loaded
        console.warn('[Reports] audit-manager.js not loaded');
        alert(`Generating tax export in ${currency}...\nFile will download as: yieldguard-tax-export-${currency}-${new Date().toISOString().split('T')[0]}.csv`);
    }
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeReports);
} else {
    initializeReports();
}

// Export for modular use
if (typeof window !== 'undefined') {
    window.initializeReports = initializeReports;
    window.handleDownloadCSV = handleDownloadCSV;
}