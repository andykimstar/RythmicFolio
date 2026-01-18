// app.js

let stockChart = null;
let currentSymbol = 'AAPL'; // Track current symbol
let currentPeriod = '1d';  // Track current period

document.addEventListener('DOMContentLoaded', () => {
    // Initial data load
    fetchStockData(currentSymbol, currentPeriod);

    const searchInput = document.getElementById('searchInput');

    // Search Event Listeners
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // Timeframe Event Listeners
    const intervals = document.querySelectorAll('.interval');
    intervals.forEach(interval => {
        interval.addEventListener('click', () => {
            // Update UI
            intervals.forEach(i => i.classList.remove('active'));
            interval.classList.add('active');

            // Update Data
            currentPeriod = interval.getAttribute('data-period');
            fetchStockData(currentSymbol, currentPeriod);
        });
    });
});

function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const symbol = searchInput.value.trim();
    if (symbol) {
        currentSymbol = symbol;
        fetchStockData(currentSymbol, currentPeriod);
    }
}

async function fetchStockData(symbol, period = '1d') {
    if (!symbol) return;
    const symbolClean = symbol.toUpperCase();

    let quoteData = null;
    let historyData = null;

    try {
        // Parallel requests: Quote (Header Info) + History (Chart)
        const [quoteRes, historyRes] = await Promise.all([
            fetch(`http://localhost:5000/api/quote/${symbolClean}`),
            fetch(`http://localhost:5000/api/history/${symbolClean}?period=${period}`)
        ]);

        if (quoteRes.ok) {
            quoteData = await quoteRes.json();
        }

        if (historyRes.ok) {
            historyData = await historyRes.json();
            if (!historyData.error) {
                renderChart(historyData, symbolClean);
            }
        }

        if (quoteData && !quoteData.error) {
            updateHeaderInfo(quoteData, historyData, period);
        }

    } catch (error) {
        console.error('Data fetch error:', error);
    }
}

function updateHeaderInfo(data, historyBox, period) {
    document.getElementById('companyName').innerText = data.company_name;
    document.getElementById('symbolLabel').innerText = data.symbol;
    document.getElementById('currentPrice').innerText = data.price.toFixed(2);

    // Calculate Change
    let change = data.change;
    let changePercent = data.change_percent;

    // If not daily, calculate change relative to the start of the chart period
    if (period !== '1d' && historyBox && historyBox.length > 0) {
        const startPrice = historyBox[0].close;
        const currentPrice = data.price;
        change = currentPrice - startPrice;
        changePercent = ((change / startPrice) * 100).toFixed(2) + '%';
    } else {
        // format backend percent which might be just a number or string
        if (typeof changePercent === 'number') {
            changePercent = changePercent.toFixed(2) + '%';
        }
    }

    const changeElem = document.getElementById('priceChange');
    const sign = change >= 0 ? '+' : '';
    // Ensure changePercent includes % if not present
    const percentStr = changePercent.includes('%') ? changePercent : changePercent + '%';

    changeElem.innerText = `${sign}${change.toFixed(2)} (${percentStr})`;
    changeElem.style.color = change >= 0 ? '#00E396' : '#ff4560';

    // Update Stats
    // Volume
    if (document.getElementById('volumeValue')) {
        document.getElementById('volumeValue').innerText = formatNetworkNumber(data.volume);
    }
    // Open
    if (document.getElementById('openValue')) {
        document.getElementById('openValue').innerText = formatNetworkNumber(data.open);
    }
    // Close
    if (document.getElementById('closeValue')) {
        document.getElementById('closeValue').innerText = formatNetworkNumber(data.close);
    }
    // High
    if (document.getElementById('highValue')) {
        document.getElementById('highValue').innerText = formatNetworkNumber(data.high);
    }
    // Low
    if (document.getElementById('lowValue')) {
        document.getElementById('lowValue').innerText = formatNetworkNumber(data.low);
    }
    // Dividends
    if (document.getElementById('divValue')) {
        document.getElementById('divValue').innerText = formatNetworkNumber(data.dividends);
    }
    // Market Cap
    if (document.getElementById('mktCapValue')) {
        document.getElementById('mktCapValue').innerText = formatNetworkNumber(data.market_cap);
    }
    // PE Ratio
    if (document.getElementById('peValue')) {
        document.getElementById('peValue').innerText = formatNetworkNumber(data.pe_ratio);
    }
    // EPS
    if (document.getElementById('epsValue')) {
        document.getElementById('epsValue').innerText = formatNetworkNumber(data.eps);
    }
    // Beta
    if (document.getElementById('betaValue')) {
        document.getElementById('betaValue').innerText = formatNetworkNumber(data.beta);
    }
}

function renderChart(data, symbol) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const labels = data.map(d => d.date);
    const prices = data.map(d => d.close);

    if (stockChart) {
        stockChart.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 227, 150, 0.2)'); // matching green accent
    gradient.addColorStop(1, 'rgba(0, 227, 150, 0)');

    stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: prices,
                borderColor: '#00E396',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
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
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        display: true,
                        color: '#8b949e',
                        maxTicksLimit: 6,
                        maxRotation: 0,
                        autoSkip: true
                    }
                }, y: {
                    grid: { color: '#2a2f3e' },
                    ticks: { color: '#8b949e' }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function formatNetworkNumber(num) {
    if (num === null || num === undefined || num === '-' || num === 0) return '-';

    // Convert string to number if needed
    const n = Number(num);

    if (isNaN(n)) return num; // Return original if not a number

    // Trillions
    if (n >= 1.0e+12) return (n / 1.0e+12).toFixed(2) + "T";
    // Billions
    if (n >= 1.0e+9) return (n / 1.0e+9).toFixed(2) + "B";
    // Millions
    if (n >= 1.0e+6) return (n / 1.0e+6).toFixed(2) + "M";
    // Thousands
    if (n >= 1.0e+3) return (n / 1.0e+3).toFixed(2) + "K";

    return n.toFixed(2);
}
