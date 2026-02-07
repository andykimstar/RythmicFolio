// Dashboard Logic (index.html)

let stockChart = null;
let currentSymbol = 'AAPL'; // Track current symbol
let currentPeriod = '1d';   // Track current period
let refreshInterval = null; // Track refresh interval

// Financial Data & Charts
let financialChartInstances = {
    Revenue: null,
    NetIncome: null,
    FreeCashFlow: null,
    Expenses: null,
    Modal: null
};
let currentModalMetric = null;
let currentModalPeriod = 'q'; // 'q' or 'a'

// Listen for global custom search event from utils.js
document.addEventListener('searchRequest', (e) => {
    if (e.detail && e.detail.symbol) {
        currentSymbol = e.detail.symbol;
        fetchStockData(currentSymbol, currentPeriod);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Check URL Params
    const symbolFromUrl = getQueryParam('symbol');
    if (symbolFromUrl) {
        currentSymbol = symbolFromUrl;
        // Clean URL
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    // Initial Load
    fetchStockData(currentSymbol, currentPeriod);

    // Auto-refresh every 60 seconds (Live Price/Change only)
    refreshInterval = setInterval(() => {
        if (currentSymbol) {
            // We only refresh the core quote data, not the whole dashboard to avoid jumping
            fetchStockData(currentSymbol, currentPeriod, true);
        }
    }, 60000);

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

async function fetchStockData(symbol, period = '1d', isRefresh = false) {
    if (!symbol) return;
    const symbolClean = symbol.toUpperCase();

    // Loading State
    const searchInput = document.getElementById('searchInput');
    const originalPlaceholder = searchInput ? searchInput.placeholder : 'Search Stocks...';

    // Only show loading state if NOT a background refresh
    if (!isRefresh) {
        if (searchInput) {
            searchInput.placeholder = `Searching ${symbolClean}...`;
            searchInput.disabled = true;
        }
        document.body.style.cursor = 'wait';
    }

    // Clear error state
    const titleEl = document.getElementById('companyName');
    if (titleEl && titleEl.innerText.startsWith('Error')) {
        titleEl.innerText = '';
    }

    let quoteData = null;
    let historyData = null;
    let statisticsData = null;
    let errorOccurred = null;

    try {
        // Execute reCAPTCHA (if available)
        const token = await new Promise((resolve) => {
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.ready(function () {
                    grecaptcha.execute('6Ldn2VwsAAAAAHtsrNTaXws8T2xY67d5JgwPbrMu', { action: 'search' })
                        .then(resolve)
                        .catch(() => resolve(null));
                });
            } else {
                resolve(null);
            }
        });

        // Timeout Promise
        const fetchWithTimeout = (url, options = {}, timeout = 12000) => {
            return Promise.race([
                fetch(url, options),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Request Timeout')), timeout))
            ]);
        };

        // Parallel Requests
        // Note: API_BASE_URL comes from utils.js
        const endpoints = [
            { id: 'quote', url: `${API_BASE_URL}/api/quote/${symbolClean}`, options: { headers: { 'X-Recaptcha-Token': token } } },
            { id: 'history', url: `${API_BASE_URL}/api/history/${symbolClean}?period=${period}` }
        ];

        // Only fetch statistics (Heavy Financials) if NOT a background refresh
        if (!isRefresh) {
            endpoints.push({ id: 'stats', url: `${API_BASE_URL}/api/statistics/${symbolClean}` });
        }

        const responses = await Promise.all(
            endpoints.map(ep => fetchWithTimeout(ep.url, ep.options || {}).then(res => ({ id: ep.id, res })))
        );

        for (const item of responses) {
            const { id, res } = item;
            if (res.ok) {
                const json = await res.json();
                if (id === 'quote') quoteData = json;
                if (id === 'history') historyData = json;
                if (id === 'stats') statisticsData = json;
            } else {
                if (id === 'quote' && res.status === 404) errorOccurred = 'Stock Not Found';
                console.warn(`${id} fetch failed:`, res.status);
            }
        }

        // Render Data
        if (quoteData && !quoteData.error) {
            updateHeaderInfo(quoteData, historyData, period);

            // Chart Color Logic
            let isPositiveChange = true;
            if (period !== '1d' && historyData && historyData.length > 0) {
                const startPrice = parseFloat(historyData[0].close);
                const currentPrice = parseFloat(quoteData.price);
                isPositiveChange = (currentPrice - startPrice) >= 0;
            } else {
                const changeVal = parseFloat(quoteData.change);
                isPositiveChange = changeVal >= 0;
            }
            const chartColor = isPositiveChange ? '#00E396' : '#ff4560';

            if (historyData && !historyData.error) {
                renderChart(historyData, symbolClean, chartColor);
            }
        } else if (!quoteData && errorOccurred) {
            const title = document.getElementById('companyName');
            if (title) title.innerText = `Error: ${errorOccurred}`;
            const symLabel = document.getElementById('symbolLabel');
            if (symLabel) symLabel.innerText = symbolClean;
        }

        if (statisticsData && !statisticsData.error) {
            updateFinancials(statisticsData);
        }

    } catch (error) {
        console.error('Data fetch error:', error);
        const titleEl = document.getElementById('companyName');
        if (titleEl) {
            if (titleEl.innerText === '' || titleEl.innerText === 'Waiting...') {
                titleEl.innerText = 'Unable to fetch data. Please try again.';
            }
        }
    } finally {
        if (!isRefresh && searchInput) {
            searchInput.placeholder = originalPlaceholder;
            searchInput.disabled = false;
            searchInput.focus();
        }
        document.body.style.cursor = 'default';
    }
}

function updateHeaderInfo(data, historyBox, period) {
    const compName = document.getElementById('companyName');
    if (compName) compName.innerText = data.company_name;
    const symLabel = document.getElementById('symbolLabel');
    if (symLabel) symLabel.innerText = data.symbol;
    const currPrice = document.getElementById('currentPrice');
    if (currPrice) currPrice.innerText = data.price.toFixed(2);

    let change = data.change;
    let changePercent = data.change_percent;

    if (period !== '1d' && historyBox && historyBox.length > 0) {
        const startPrice = historyBox[0].close;
        const currentPrice = data.price;
        change = currentPrice - startPrice;
        changePercent = ((change / startPrice) * 100).toFixed(2) + '%';
    } else {
        if (typeof changePercent === 'number') {
            changePercent = changePercent.toFixed(2) + '%';
        }
    }

    const changeElem = document.getElementById('priceChange');
    if (changeElem) {
        const sign = change >= 0 ? '+' : '';
        const percentStr = changePercent.includes('%') ? changePercent : changePercent + '%';
        changeElem.innerText = `${sign}${change.toFixed(2)} (${percentStr})`;
        changeElem.style.color = change >= 0 ? '#00E396' : '#ff4560';
    }

    // Update Stats using formatNetworkNumber from utils.js
    const statIds = {
        'volumeValue': data.volume,
        'openValue': data.open,
        'closeValue': data.close,
        'highValue': data.high,
        'lowValue': data.low,
        'divValue': data.dividends,
        'mktCapValue': data.market_cap,
        'peValue': data.pe_ratio,
        'epsValue': data.eps,
        'betaValue': data.beta
    };

    for (const [id, val] of Object.entries(statIds)) {
        const el = document.getElementById(id);
        if (el) el.innerText = formatNetworkNumber(val);
    }
}

function renderChart(data, symbol, colorOverride) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const labels = data.map(d => d.date);
    const prices = data.map(d => d.close);

    if (stockChart) {
        stockChart.destroy();
    }

    let chartColor = colorOverride || '#00E396';
    if (!colorOverride && prices.length > 0) {
        chartColor = (prices[prices.length - 1] >= prices[0]) ? '#00E396' : '#ff4560';
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    gradient.addColorStop(0, hexToRgba(chartColor, 0.2));
    gradient.addColorStop(1, hexToRgba(chartColor, 0));

    stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: prices,
                borderColor: chartColor,
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
                    ticks: { display: true, color: '#8b949e', maxTicksLimit: 6, autoSkip: true }
                },
                y: {
                    grid: { color: '#2a2f3e' },
                    ticks: { color: '#8b949e' }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// Financials Logic
function updateFinancials(data) {
    window.financialData = data;
    renderFinancials('q'); // Default Q

    const toggles = document.querySelectorAll('.financial-section .toggle-item');
    toggles.forEach(t => {
        t.onclick = () => {
            toggles.forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            const mode = t.innerText.includes('Quarterly') ? 'q' : 'a';
            renderFinancials(mode);
        };
    });
}

function renderFinancials(mode) {
    if (!window.financialData) return;
    const d = window.financialData;
    const prefix = mode === 'q' ? 'QYoY_' : 'AYoY_';

    // Dates
    const dateMetaKey = mode === 'q' ? 'meta_quarterly_dates' : 'meta_annual_dates';
    const dateText = d[dateMetaKey] ? `Comparing: ${d[dateMetaKey]}` : '';
    const dateEl = document.getElementById('comparisonDates');
    if (dateEl) dateEl.innerText = dateText;

    // Growth Grid
    const map = {
        'Revenue Growth': 'Revenue_Growth',
        'Free Cash Flow Growth': 'FreeCashFlow_Growth',
        'Expense Growth': 'Expense_Growth',
        'Net Income Growth': 'NetIncome_Growth',
        'Operating Margin Growth': 'OperatingMargin_Growth',
        'Share Outstanding Growth': 'OrdinarySharesNumber_Growth'
    };

    const items = document.querySelectorAll('.financial-section .growth-grid .growth-item');
    items.forEach(item => {
        const label = item.querySelector('.growth-label').innerText.trim();
        const valueSpan = item.querySelector('.growth-value');
        const keySuffix = map[label];
        if (keySuffix) {
            const val = d[prefix + keySuffix];
            if (val === '-' || val === undefined) {
                valueSpan.innerText = '-';
                valueSpan.className = 'growth-value';
            } else {
                valueSpan.innerText = val + '%';
                valueSpan.className = 'growth-value ' + (parseFloat(val) >= 0 ? 'text-green' : 'text-red');
            }
        }
    });

    // Charts
    ['Revenue', 'NetIncome', 'FreeCashFlow', 'Expenses', 'ShareOutstanding', 'OperatingMargin'].forEach(m => {
        renderMetricChart(m, d, mode);
    });
}

// Modal Logic
function openChartModal(metric) {
    const modal = document.getElementById('chartModal');
    if (!modal) return;
    currentModalMetric = metric;

    const activeToggle = document.querySelector('.financial-section .toggle-item.active');
    currentModalPeriod = activeToggle && activeToggle.innerText.includes('Annual') ? 'a' : 'q';

    modal.style.display = 'flex';
    updateModalUI();
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    if (modal) modal.style.display = 'none';
}

const metricOrder = ['Revenue', 'NetIncome', 'FreeCashFlow', 'Expenses', 'OperatingMargin', 'ShareOutstanding'];

function navigateModalChart(direction) {
    if (!currentModalMetric) return;
    let idx = metricOrder.indexOf(currentModalMetric);
    if (idx === -1) idx = 0;

    let newIdx = idx + direction;
    if (newIdx < 0) newIdx = metricOrder.length - 1;
    if (newIdx >= metricOrder.length) newIdx = 0;

    currentModalMetric = metricOrder[newIdx];
    updateModalUI();
}

function switchModalPeriod(period) {
    currentModalPeriod = period;
    updateModalUI();
}

function updateModalUI() {
    const metric = currentModalMetric;
    const mode = currentModalPeriod;
    const d = window.financialData;

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.innerText = metric.replace(/([A-Z])/g, ' $1').trim();

    const btnQ = document.getElementById('modalToggleQ');
    const btnA = document.getElementById('modalToggleA');
    if (mode === 'q') {
        btnQ.className = 'modal-toggle active'; btnA.className = 'modal-toggle';
        btnQ.style.background = '#4b5563'; btnQ.style.color = '#fff';
        btnA.style.background = 'transparent'; btnA.style.color = '#9ca3af';
    } else {
        btnA.className = 'modal-toggle active'; btnQ.className = 'modal-toggle';
        btnA.style.background = '#4b5563'; btnA.style.color = '#fff';
        btnQ.style.background = 'transparent'; btnQ.style.color = '#9ca3af';
    }

    const map = {
        'Revenue': 'Revenue_Growth', 'NetIncome': 'NetIncome_Growth', 'FreeCashFlow': 'FreeCashFlow_Growth',
        'Expenses': 'Expense_Growth', 'ShareOutstanding': 'OrdinarySharesNumber_Growth', 'OperatingMargin': 'OperatingMargin_Growth'
    };
    const prefix = mode === 'q' ? 'QYoY_' : 'AYoY_';
    const growthVal = d[prefix + map[metric]];
    const growthEl = document.getElementById('modalGrowthValue');

    if (!growthVal || growthVal === '-') {
        growthEl.innerText = '-';
        growthEl.style.color = '#fff';
    } else {
        const valNum = parseFloat(growthVal);
        const sign = valNum >= 0 ? '+' : '';
        growthEl.innerText = `${sign}${growthVal}%`;
        growthEl.style.color = valNum >= 0 ? '#00E396' : '#ff4560';
    }

    const modeKey = mode === 'q' ? 'quarterly' : 'annual';
    const chartData = d.charts[modeKey][metric];
    renderModalChart(chartData, metric);
}

function renderMetricChart(metric, data, mode) {
    if (!data.charts) return;
    const modeKey = mode === 'q' ? 'quarterly' : 'annual';
    const chartData = data.charts[modeKey][metric];

    const canvas = document.getElementById(`chart${metric}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!chartData || chartData.length === 0) {
        if (financialChartInstances[metric]) financialChartInstances[metric].destroy();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '20px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Data', canvas.width / 2, canvas.height / 2);
        return;
    }

    if (financialChartInstances[metric]) financialChartInstances[metric].destroy();

    const labels = chartData.map(c => c.date);
    const values = chartData.map(c => c.value);

    const metricColors = {
        'Revenue': 'rgba(54, 162, 235, 0.6)', 'NetIncome': 'rgba(153, 102, 255, 0.6)',
        'FreeCashFlow': 'rgba(255, 159, 64, 0.6)', 'Expenses': 'rgba(255, 205, 86, 0.6)',
        'ShareOutstanding': 'rgba(75, 192, 192, 0.6)', 'OperatingMargin': 'rgba(201, 203, 207, 0.6)'
    };

    financialChartInstances[metric] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: metricColors[metric] || '#5c9ea6',
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

function renderModalChart(data, metric) {
    const ctx = document.getElementById('modalChartCanvas').getContext('2d');
    if (financialChartInstances.Modal) financialChartInstances.Modal.destroy();

    if (!data || data.length === 0) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '48px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No Data', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const labels = data.map(d => {
        const parts = d.date.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        if (currentModalPeriod === 'q') return `Q${Math.ceil(month / 3)} ${year}`;
        else return `FY${year.toString().slice(-2)}`;
    });
    const values = data.map(d => d.value);

    // Re-implement Trendline Plugin (omitted for brevity but crucial for UX, let's include simplified version)
    // Actually you asked for "fix issues in app.js" and splitting means copying logic.
    // I should copy the trendLinePlugin completely.

    // ... Copying plugin code inline here ...
    const trendLinePlugin = {
        id: 'trendLinePlugin',
        afterInit(chart) {
            chart.trendLineActiveIndex = -1;
        },
        afterEvent(chart, args) {
            const { event } = args;
            // Handle hover to show/hide percentages
            if (event.type !== 'mousemove' && event.type !== 'mouseout') return;

            if (event.type === 'mouseout') {
                if (chart.trendLineActiveIndex !== -1) {
                    chart.trendLineActiveIndex = -1;
                    args.changed = true;
                }
                return;
            }

            // Find which segment we are hovering
            const meta = chart.getDatasetMeta(0);
            const dataPts = chart.data.datasets[0].data;
            let foundIndex = -1;

            for (let i = 0; i < meta.data.length - 1; i++) {
                const currBar = meta.data[i];
                const nextBar = meta.data[i + 1];

                // Check active data
                if (dataPts[i] === null || dataPts[i + 1] === null) continue;

                const x1 = currBar.x;
                const x2 = nextBar.x;

                // Simple hit detection: is mouse X between the two bars?
                if (event.x >= x1 && event.x <= x2) {
                    foundIndex = i;
                    break;
                }
            }

            if (chart.trendLineActiveIndex !== foundIndex) {
                chart.trendLineActiveIndex = foundIndex;
                args.changed = true; // Trigger re-render
            }
        },
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            const meta = chart.getDatasetMeta(0);
            const activeIndex = chart.trendLineActiveIndex;

            ctx.save();

            for (let i = 0; i < meta.data.length - 1; i++) {
                const currBar = meta.data[i];
                const nextBar = meta.data[i + 1];

                const currVal = data.datasets[0].data[i];
                const nextVal = data.datasets[0].data[i + 1];

                if (currVal === null || nextVal === null) continue;

                const diff = ((nextVal - currVal) / Math.abs(currVal)) * 100;
                const isPositive = diff >= 0;
                const color = isPositive ? '#00E396' : '#ff4560';

                const x1 = currBar.x;
                const y1 = currBar.y;
                const x2 = nextBar.x;
                const y2 = nextBar.y;

                // Draw Smoother Line (Bezier Curve)
                // Control points for S-curve (sigmoid)
                const cp1x = x1 + (x2 - x1) / 2;
                const cp1y = y1;
                const cp2x = x1 + (x2 - x1) / 2;
                const cp2y = y2;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);

                ctx.lineWidth = 4;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Draw Label ONLY if hovering this segment
                if (i === activeIndex) {
                    // Calculate midpoint of the curve approx
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2; // Linear midpoint is acceptable for label placement

                    ctx.fillStyle = color;
                    ctx.font = 'bold 16px Inter'; // Clearer font
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';

                    // Add subtle shadow or outline for readability if needed, but simple color usually works on dark bg
                    ctx.fillText(`${diff.toFixed(2)}%`, midX, midY - 10);
                }
            }

            ctx.restore();
        }
    };

    financialChartInstances.Modal = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: (() => {
                    const metricColors = {
                        'Revenue': 'rgba(54, 162, 235, 0.6)',
                        'NetIncome': 'rgba(153, 102, 255, 0.6)',
                        'FreeCashFlow': 'rgba(255, 159, 64, 0.6)',
                        'Expenses': 'rgba(255, 205, 86, 0.6)',
                        'ShareOutstanding': 'rgba(75, 192, 192, 0.6)',
                        'OperatingMargin': 'rgba(201, 203, 207, 0.6)'
                    };
                    return metricColors[metric] || '#4e36cc';
                })(),
                borderRadius: 4,
                barThickness: 50, // Thicker bars
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#1e2433',
                    titleColor: '#fff',
                    callbacks: {
                        label: (c) => metric === 'OperatingMargin' ? c.raw.toFixed(2) + '%' : formatNetworkNumber(c.raw)
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    display: true,
                    grid: { display: true, color: '#2a2f3e' },
                    ticks: {
                        color: '#9ca3af',
                        callback: (val) => metric === 'OperatingMargin' ? val + '%' : formatNetworkNumber(val),
                        maxTicksLimit: 6
                    }
                }
            },
            layout: {
                padding: {
                    top: 30,
                    left: 50,
                    right: 50
                }
            }
        },
        plugins: [trendLinePlugin]
    });
}
