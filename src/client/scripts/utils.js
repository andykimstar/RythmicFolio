// Shared Configuration & Utilities

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : ''; // Use relative paths for production

// Helper to get query params
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Global Search Handler
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const symbol = searchInput.value.trim();

    if (symbol) {
        // If we are NOT on the main dashboard (index.html), redirect there
        // Identify main page by presence of specific UI element like 'stockChart'
        if (!document.getElementById('stockChart')) {
            // Redirect to root index.html with param
            window.location.href = window.location.origin + `/index.html?symbol=${encodeURIComponent(symbol)}`;
        } else {
            // We are on dashboard.js, so we rely on the global fetchStockData function defined there.
            // However, since dashboard.js might not be loaded yet or we want loose coupling, 
            // we can dispatch an event or just call it if we know it exists.
            // Given the original code simply called `fetchStockData` or set `currentSymbol`, 
            // we will let dashboard.js handle the actual fetch if it's running.
            // BUT, wait. If we are on index.html, `dashboard.js` will be loaded.
            // If the user hits enter, this runs.
            if (typeof fetchStockData === 'function') {
                // We need to update the currentSymbol in dashboard.js too? 
                // Using a custom event is cleaner.
                const event = new CustomEvent('searchRequest', { detail: { symbol } });
                document.dispatchEvent(event);
            } else {
                window.location.href = window.location.origin + `/index.html?symbol=${encodeURIComponent(symbol)}`;
            }
        }
    }
}

// Format Large Numbers
function formatNetworkNumber(num) {
    if (num === null || num === undefined || num === '-' || num === 0) return '-';

    const n = Number(num);
    if (isNaN(n)) return num;

    if (n >= 1.0e+12) return (n / 1.0e+12).toFixed(2) + "T";
    if (n >= 1.0e+9) return (n / 1.0e+9).toFixed(2) + "B";
    if (n >= 1.0e+6) return (n / 1.0e+6).toFixed(2) + "M";
    if (n >= 1.0e+3) return (n / 1.0e+3).toFixed(2) + "K";

    return n.toFixed(2);
}

// Global Event Listeners for Search Input
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }
});
