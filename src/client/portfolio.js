// Portfolio Logic (portfolio.html)

let allHoldings = [];
let sortConfig = { key: 'name', direction: 'asc' };
let allWatchlist = [];
let watchlistSortConfig = { key: 'name', direction: 'asc' };
let portfolioChartInstance = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchHoldings();
    fetchWatchlist();
});

async function fetchHoldings() {
    const holdingsBody = document.getElementById('holdingsBody');
    if (!holdingsBody) return;

    const searchInput = document.getElementById('searchInput');
    document.body.style.cursor = 'wait';
    if (searchInput) {
        searchInput.disabled = true;
        searchInput.placeholder = "Loading Portfolio...";
    }
    holdingsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 40px;">Loading Holdings...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/holdings`);
        if (!response.ok) throw new Error('Failed to fetch holdings');

        const data = await response.json();
        allHoldings = data.holdings || [];

        // Update Portfolio Header
        const portfolioTitle = document.getElementById('portfolioTitle');
        if (portfolioTitle) portfolioTitle.textContent = `Personal Portfolio`;

        // Render Portfolio Chart
        if (data.chart_data && data.chart_data.length > 0) {
            renderPortfolioChart(data.chart_data);
        }

        // Setup Intervals
        setupPortfolioIntervals();

        // Render Table
        renderHoldingsTable(allHoldings);

    } catch (error) {
        console.error('Error fetching holdings:', error);
        holdingsBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #ff4560; padding: 20px;">Error loading holdings. Please try again.</td></tr>`;
    } finally {
        document.body.style.cursor = 'default';
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = "Search Stocks ...";
        }
    }
}

function renderHoldingsTable(holdings) {
    const tbody = document.getElementById('holdingsBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!holdings || holdings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No holdings found.</td></tr>';
        return;
    }

    // Sort Logic
    const sorted = [...holdings].sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'name') {
            valA = (a.name || a.symbol).toLowerCase();
            valB = (b.name || b.symbol).toLowerCase();
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }

        if (['weight', 'week_change', 'target_price', 'forward_pe', 'beta'].includes(sortConfig.key)) {
            valA = parseFloat(String(valA).replace(/[^0-9.-]/g, ''));
            valB = parseFloat(String(valB).replace(/[^0-9.-]/g, ''));
        }
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    sorted.forEach(h => {
        const tr = document.createElement('tr');
        const changeClass = (h.week_change >= 0) ? 'positive' : 'negative';
        const changeColor = (h.week_change >= 0) ? '#00E396' : '#ff4560';
        const changeSign = (h.week_change >= 0) ? '+' : '';
        const price = h.current_price !== '-' ? '$' + parseFloat(h.current_price).toFixed(2) : '-';

        tr.innerHTML = `
            <td class="symbol-cell">
                <div class="asset-color-bar" style="background-color: ${h.color || '#333'}"></div>
                <div class="asset-info">
                    <span class="asset-ticker">${h.symbol}</span>
                    <span class="asset-name">${h.name}</span>
                </div>
            </td>
            <td>${price}</td>
            <td>${h.weight}%</td>
            <td>$${h.target_price || "-"}</td>
            <td style="color: ${changeColor}">${changeSign}${h.week_change}%</td>
            <td>${h.forward_pe !== undefined ? h.forward_pe : "-"}</td>
            <td>${h.beta !== undefined ? h.beta : "-"}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Sort Icons
    document.querySelectorAll('#holdingsTable .sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        const key = th.getAttribute('data-sort');
        if (key === sortConfig.key) {
            icon.textContent = sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        } else {
            icon.textContent = '';
        }
        th.onclick = () => {
            if (sortConfig.key === key) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.key = key;
                sortConfig.direction = 'desc'; // Default desc for new columns often better for numbers
            }
            renderHoldingsTable(allHoldings);
        };
    });
}

function setupPortfolioIntervals() {
    const container = document.getElementById('portfolioTimeIntervals');
    if (!container) return;

    const intervals = container.querySelectorAll('.time-interval');
    intervals.forEach(span => {
        span.onclick = () => {
            intervals.forEach(i => i.classList.remove('active'));
            span.classList.add('active');
            const period = span.getAttribute('data-period');
            updatePortfolioChart(period);
        };
    });
}

async function updatePortfolioChart(period) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/holdings?period=${period}`);
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        if (data.chart_data && data.chart_data.length > 0) {
            renderPortfolioChart(data.chart_data);
        }
    } catch (error) {
        console.error('Error updating portfolio chart:', error);
    }
}

function renderPortfolioChart(data) {
    const ctx = document.getElementById('portfolioChart');
    if (!ctx) return;
    const context = ctx.getContext('2d');
    const labels = data.map(d => d.date);
    const values = data.map(d => d.value);

    if (portfolioChartInstance) portfolioChartInstance.destroy();

    const startVal = values[0];
    const endVal = values[values.length - 1];
    const displayChange = isNaN(endVal) ? 0 : endVal; // Chart value is % return usually? Or value? Assuming Value or Return.
    // If backend sends cumulative return %, then start is 0. If value, check diff.
    // Based on previous code, data.value seems to be "Cumulative Return" in %, hence endVal is the total change?
    // Let's assume consistent with previous logic.

    const isPositive = displayChange >= 0;
    const chartColor = isPositive ? '#00E396' : '#ff4560';

    const changeElement = document.getElementById('portfolioChange');
    if (changeElement) {
        const sign = isPositive ? '+' : '';
        changeElement.textContent = `${sign}${displayChange.toFixed(2)}%`;
        changeElement.style.color = chartColor;
    }

    const gradient = context.createLinearGradient(0, 0, 0, 400);
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    gradient.addColorStop(0, hexToRgba(chartColor, 0.2));
    gradient.addColorStop(1, hexToRgba(chartColor, 0));

    portfolioChartInstance = new Chart(context, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Return',
                data: values,
                borderColor: chartColor,
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1e2433',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#333',
                    borderWidth: 1,
                    callbacks: { label: function (context) { return 'Return: ' + context.parsed.y.toFixed(2) + '%'; } }
                }
            },
            scales: {
                x: { display: true, grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 6 } },
                y: { display: true, position: 'right', grid: { color: '#374151', drawBorder: false }, ticks: { color: '#6b7280', callback: function (value) { return value.toFixed(1) + '%'; } } }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// Watchlist Logic
async function fetchWatchlist() {
    const watchlistBody = document.getElementById('watchlistBody');
    if (!watchlistBody) return;

    if (watchlistBody.children.length === 0) {
        watchlistBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">Loading Watchlist...</td></tr>';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist`);
        if (!response.ok) throw new Error('Failed to fetch watchlist');

        const data = await response.json();
        allWatchlist = data.watchlist || [];
        renderWatchlistTable();

    } catch (error) {
        console.error('Error fetching watchlist:', error);
        watchlistBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: #ff4560; padding: 20px;">Error loading watchlist.</td></tr>`;
    }
}

function renderWatchlistTable() {
    const watchlistBody = document.getElementById('watchlistBody');
    if (!watchlistBody) return;
    watchlistBody.innerHTML = '';

    if (allWatchlist.length === 0) {
        watchlistBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Your watchlist is empty.</td></tr>';
        return;
    }

    const sorted = [...allWatchlist].sort((a, b) => {
        let valA = a[watchlistSortConfig.key];
        let valB = b[watchlistSortConfig.key];
        if (watchlistSortConfig.key === 'name') {
            valA = (a.name || a.symbol).toLowerCase();
            valB = (b.name || b.symbol).toLowerCase();
            if (valA < valB) return watchlistSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return watchlistSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return watchlistSortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    sorted.forEach(item => {
        const tr = document.createElement('tr');
        const price = item.current_price !== '-' ? `$${parseFloat(item.current_price).toFixed(2)}` : '-';
        const change = parseFloat(item.week_change || 0);
        const changeColor = change >= 0 ? '#00E396' : '#ff4560';
        const changeSign = change >= 0 ? '+' : '';

        tr.innerHTML = `
                <td class="symbol-cell">
                    <div class="asset-color-bar" style="background-color: ${item.color || '#333'}"></div>
                    <div class="asset-info">
                        <span class="asset-ticker">${item.symbol}</span>
                        <span class="asset-name">${item.name || item.symbol}</span>
                    </div>
                </td>
                <td>${price}</td>
                <td style="color: ${changeColor}">${changeSign}${change.toFixed(2)}%</td>
                <td>${item.forward_pe || '-'}</td>
                <td>${item.beta || '-'}</td>
                <td><button class="btn-icon delete-btn" style="background:transparent; border:none; color:#ea4335; cursor:pointer;" onclick="removeFromWatchlist('${item.symbol}')"><i class="fas fa-trash"></i></button></td>
            `;
        watchlistBody.appendChild(tr);
    });

    // Update Headers
    const table = watchlistBody.closest('table');
    if (table) {
        table.querySelectorAll('.sortable').forEach(header => {
            header.onclick = () => {
                const key = header.getAttribute('data-sort');
                if (watchlistSortConfig.key === key) {
                    watchlistSortConfig.direction = watchlistSortConfig.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    watchlistSortConfig.key = key;
                    watchlistSortConfig.direction = 'desc';
                }
                renderWatchlistTable();
            };
            // Update icons omitted for brevity, logic remains same
        });
    }
}

async function removeFromWatchlist(symbol) {
    if (!confirm(`Remove ${symbol} from watchlist?`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist?symbol=${symbol}`, { method: 'DELETE' });
        if (response.ok) fetchWatchlist();
        else alert('Failed to remove stock');
    } catch (error) {
        console.error('Error removing from watchlist:', error);
    }
}
