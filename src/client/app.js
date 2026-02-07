// app.js

let stockChart = null;
let currentSymbol = 'AAPL'; // Track current symbol
let currentPeriod = '1d';  // Track current period

// Helper to get query params
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for symbol in URL query params on load (e.g. ?symbol=TSLA)
    const symbolFromUrl = getQueryParam('symbol');
    if (symbolFromUrl) {
        currentSymbol = symbolFromUrl;
        // Clean URL after reading without reload
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    // Only fetch data if we are on the Stock Analysis page (index.html)
    // We check if the chart element exists to confirm we are on the right page
    if (document.getElementById('stockChart') && !symbolFromUrl) {
        // Default load if no URL param
        fetchStockData(currentSymbol, currentPeriod);
    } else if (document.getElementById('stockChart') && symbolFromUrl) {
        fetchStockData(symbolFromUrl, currentPeriod);
    }

    // Portfolio Page Specific
    if (document.getElementById('holdingsBody')) {
        fetchHoldings();
    }


    const searchInput = document.getElementById('searchInput');

    // Search Event Listeners
    // Search Event Listeners
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }

    // Timeframe Event Listeners (Only on Dashboard)
    if (document.getElementById('stockChart')) {
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
    }
});

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
            // Already on dashboard, just fetch
            currentSymbol = symbol;
            fetchStockData(currentSymbol, currentPeriod);
        }
    }
}

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : ''; // Use relative paths for production to leverage Firebase Rewrites



async function fetchStockData(symbol, period = '1d') {
    if (!symbol) return;
    const symbolClean = symbol.toUpperCase();

    // Loading State
    const searchInput = document.getElementById('searchInput');
    const originalPlaceholder = searchInput.placeholder;
    searchInput.placeholder = `Searching ${symbolClean}...`;
    searchInput.disabled = true;
    document.body.style.cursor = 'wait';

    // Clear potentially old error state
    const titleEl = document.getElementById('companyName');
    if (titleEl.innerText.startsWith('Error')) {
        titleEl.innerText = '';
    }

    let quoteData = null;
    let historyData = null;
    let statisticsData = null;
    let errorOccurred = null;

    try {
        // Execute reCAPTCHA
        const token = await new Promise((resolve) => {
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.ready(function () {
                    grecaptcha.execute('6Ldn2VwsAAAAAHtsrNTaXws8T2xY67d5JgwPbrMu', { action: 'search' })
                        .then(resolve)
                        .catch(() => resolve(null)); // Fallback if execution fails
                });
            } else {
                resolve(null); // Local dev or blocked
            }
        });

        // Parallel requests with Timeout Promise
        // We use a simple timeout race to prevent infinite hanging
        const fetchWithTimeout = (url, options = {}, timeout = 12000) => {
            return Promise.race([
                fetch(url, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request Timeout')), timeout)
                )
            ]);
        };

        // Parallel requests: Quote (Protected), History, and Statistics
        const [quoteRes, historyRes, statsRes] = await Promise.all([
            fetchWithTimeout(`${API_BASE_URL}/api/quote/${symbolClean}`, {
                headers: { 'X-Recaptcha-Token': token }
            }),
            fetchWithTimeout(`${API_BASE_URL}/api/history/${symbolClean}?period=${period}`),
            fetchWithTimeout(`${API_BASE_URL}/api/statistics/${symbolClean}`)
        ]);

        if (quoteRes.ok) {
            quoteData = await quoteRes.json();
        } else {
            console.warn('Quote fetch failed:', quoteRes.status);
            if (quoteRes.status === 404) errorOccurred = 'Stock Not Found';
        }

        if (historyRes.ok) {
            historyData = await historyRes.json();
            // Moved renderChart call down to pass color
        }

        if (statsRes.ok) {
            statisticsData = await statsRes.json();
        }

        if (quoteData && !quoteData.error) {
            updateHeaderInfo(quoteData, historyData, period);

            // Determine Chart Color from Change Logic
            let isPositiveChange = true;
            if (period !== '1d' && historyData && historyData.length > 0) {
                const startPrice = parseFloat(historyData[0].close);
                const currentPrice = parseFloat(quoteData.price);
                const change = currentPrice - startPrice;
                isPositiveChange = change >= 0;
            } else {
                // Fallback to daily change
                const changeVal = parseFloat(quoteData.change);
                isPositiveChange = changeVal >= 0;
            }
            const chartColor = isPositiveChange ? '#00E396' : '#ff4560';

            if (historyData && !historyData.error) {
                renderChart(historyData, symbolClean, chartColor);
            }

        } else if (!quoteData && errorOccurred) {
            // Show error if quote failed explicitly
            document.getElementById('companyName').innerText = `Error: ${errorOccurred}`;
            document.getElementById('symbolLabel').innerText = symbolClean;
        }

        if (statisticsData && !statisticsData.error) {
            updateFinancials(statisticsData);
        }

    } catch (error) {
        console.error('Data fetch error:', error);
        const titleEl = document.getElementById('companyName');
        if (titleEl) {
            // Only overwrite if we don't have partial data
            if (titleEl.innerText === '' || titleEl.innerText === 'Waiting...') {
                titleEl.innerText = 'Unable to fetch data. Please try again.';
            }
        }
    } finally {
        // Reset Loading State
        if (searchInput) {
            searchInput.placeholder = originalPlaceholder;
            searchInput.disabled = false;
            searchInput.focus();
        }
        document.body.style.cursor = 'default';
    }
}

function updateFinancials(data) {
    // Helper to format percentage with color
    const setGrowth = (labelPrefix, value) => {
        // value is a number or "-"
        // Find all elements that might match, but here we probably want to select by text content or index?
        // The HTML structure is .growth-item -> .growth-label + .growth-value
        // Since we didn't add IDs to the growth items in HTML, we need to map them order-wise or select them smartly.
        // Let's rely on the order in the HTML for now or add IDs next time.
        // Or better: Iterate over the grid items and match the label text.

        // Wait, the user has "Quarterly YoY" and "Annual YoY" toggles.
        // We should store the data and let the toggle switch the view.
        // For simplicity now, let's default to Quarterly.
    };

    // Store data globally or on the DOM to handle toggling
    window.financialData = data;

    // Default to Quarterly View on load
    renderFinancials('q');

    // Add Click Listeners to Toggles if not already added
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

// Store chart instances to destroy them before re-rendering
const financialChartInstances = {
    Revenue: null,
    NetIncome: null,
    FreeCashFlow: null,
    Expenses: null,
    Modal: null
};



function renderFinancials(mode) {
    if (!window.financialData) return;

    const d = window.financialData;
    const prefix = mode === 'q' ? 'QYoY_' : 'AYoY_';

    // Update Comparison Dates Display
    const dateMetaKey = mode === 'q' ? 'meta_quarterly_dates' : 'meta_annual_dates';
    const dateText = d[dateMetaKey] ? `Comparing: ${d[dateMetaKey]}` : '';
    const dateEl = document.getElementById('comparisonDates');
    if (dateEl) dateEl.innerText = dateText;

    // Map Label Text to Data Key Suffix
    const map = {
        'Revenue Growth': 'Revenue_Growth',
        'Free Cash Flow Growth': 'FreeCashFlow_Growth',
        'Expense Growth': 'Expense_Growth',
        'Net Income Growth': 'NetIncome_Growth',
        'Operating Margin Growth': 'OperatingMargin_Growth', // or EBITDA proxy
        'Share Outstanding Growth': 'OrdinarySharesNumber_Growth'
    };

    const items = document.querySelectorAll('.financial-section .growth-grid .growth-item');

    items.forEach(item => {
        const label = item.querySelector('.growth-label').innerText.trim();
        const valueSpan = item.querySelector('.growth-value');

        const keySuffix = map[label];
        if (keySuffix) {
            const dataKey = prefix + keySuffix;
            let val = d[dataKey];

            // Format
            if (val === '-' || val === undefined) {
                valueSpan.innerText = '-';
                valueSpan.className = 'growth-value';
            } else {
                valueSpan.innerText = val + '%';
                // Color
                valueSpan.className = 'growth-value ' + (parseFloat(val) >= 0 ? 'text-green' : 'text-red');
            }
        }
    });

    // Render Charts
    renderMetricChart('Revenue', d, mode);
    renderMetricChart('NetIncome', d, mode);
    renderMetricChart('FreeCashFlow', d, mode);
    renderMetricChart('Expenses', d, mode);
    renderMetricChart('ShareOutstanding', d, mode);
    renderMetricChart('OperatingMargin', d, mode);
}

function renderMetricChart(metric, data, mode) {
    if (!data.charts) return;

    const modeKey = mode === 'q' ? 'quarterly' : 'annual';
    const chartData = data.charts[modeKey][metric]; // List of {date, value}

    const canvas = document.getElementById(`chart${metric}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!chartData || chartData.length === 0) {
        if (financialChartInstances[metric]) {
            financialChartInstances[metric].destroy();
        }
        // Display No Data
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '20px Inter'; // Larger
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Data', canvas.width / 2, canvas.height / 2);

        // Update Title Check (in case it wasn't set)
        const container = canvas.parentElement;
        if (container && container.previousElementSibling) {
            let titleText = `${metric.replace(/([A-Z])/g, ' $1').trim()} (${mode === 'q' ? 'Quarterly' : 'Annual'})`;
            if (metric === 'OperatingMargin') titleText = 'OperatingMargin';
            container.previousElementSibling.innerText = titleText;
        }
        return;
    }

    // Destroy existing
    if (financialChartInstances[metric]) {
        financialChartInstances[metric].destroy();
    }

    const labels = chartData.map(c => c.date);
    const values = chartData.map(c => c.value);

    // Metric Colors
    const metricColors = {
        'Revenue': 'rgba(54, 162, 235, 0.6)',      // Blue
        'NetIncome': 'rgba(153, 102, 255, 0.6)',    // Purple
        'FreeCashFlow': 'rgba(255, 159, 64, 0.6)',  // Orange
        'Expenses': 'rgba(255, 205, 86, 0.6)',      // Yellow
        'ShareOutstanding': 'rgba(75, 192, 192, 0.6)', // Teal
        'OperatingMargin': 'rgba(201, 203, 207, 0.6)'          // Grey
    };
    const color = metricColors[metric] || '#5c9ea6';

    financialChartInstances[metric] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: color,
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e2433',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#333',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            // Format large numbers
                            let val = context.raw;
                            if (metric === 'OperatingMargin') return val.toFixed(2) + '%';
                            return formatNetworkNumber(val);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: false
                }
            }
        }
    });

    // Update Card Title with Period
    const container = ctx.parentElement;
    if (container && container.previousElementSibling) {
        let titleText = `${metric.replace(/([A-Z])/g, ' $1').trim()} (${mode === 'q' ? 'Quarterly' : 'Annual'})`;
        if (metric === 'OperatingMargin') titleText = 'OperatingMargin';
        container.previousElementSibling.innerText = titleText;
    }
}

// Modal Functions
let currentModalMetric = null;
let currentModalPeriod = 'q'; // 'q' or 'a'

function openChartModal(metric) {
    const modal = document.getElementById('chartModal');
    currentModalMetric = metric;

    // Sync with main dashboard toggle initially
    const activeToggle = document.querySelector('.financial-section .toggle-item.active');
    currentModalPeriod = activeToggle && activeToggle.innerText.includes('Annual') ? 'a' : 'q';

    modal.style.display = 'flex';
    updateModalUI();
}

function closeChartModal() {
    document.getElementById('chartModal').style.display = 'none';
}

const metricOrder = ['Revenue', 'NetIncome', 'FreeCashFlow', 'Expenses', 'OperatingMargin', 'ShareOutstanding'];

function navigateModalChart(direction) {
    if (!currentModalMetric) return;

    let currentIndex = metricOrder.indexOf(currentModalMetric);
    if (currentIndex === -1) currentIndex = 0;

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = metricOrder.length - 1;
    if (newIndex >= metricOrder.length) newIndex = 0;

    currentModalMetric = metricOrder[newIndex];
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

    // Update Title
    const titleEl = document.getElementById('modalTitle');
    titleEl.innerText = metric.replace(/([A-Z])/g, ' $1').trim();

    // Update Toggles UI
    document.getElementById('modalToggleQ').className = mode === 'q' ? 'modal-toggle active' : 'modal-toggle';
    document.getElementById('modalToggleA').className = mode === 'a' ? 'modal-toggle active' : 'modal-toggle';

    // Update Toggle Styles manually since I used inline styles in HTML (cleaner to key off class in CSS but this works fast)
    const btnQ = document.getElementById('modalToggleQ');
    const btnA = document.getElementById('modalToggleA');
    if (mode === 'q') {
        btnQ.style.background = '#4b5563'; btnQ.style.color = '#fff';
        btnA.style.background = 'transparent'; btnA.style.color = '#9ca3af';
    } else {
        btnA.style.background = '#4b5563'; btnA.style.color = '#fff';
        btnQ.style.background = 'transparent'; btnQ.style.color = '#9ca3af';
    }

    // Update Growth Value using the pre-calculated stats
    // Map metric name to the stats keys
    const map = {
        'Revenue': 'Revenue_Growth',
        'NetIncome': 'NetIncome_Growth',
        'FreeCashFlow': 'FreeCashFlow_Growth',
        'Expenses': 'Expense_Growth',
        'ShareOutstanding': 'OrdinarySharesNumber_Growth',
        'OperatingMargin': 'OperatingMargin_Growth'
    };
    const prefix = mode === 'q' ? 'QYoY_' : 'AYoY_';
    const key = prefix + map[metric];
    const growthVal = d[key]; // String like "5.60" or "-"

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

    // Render Chart
    const modeKey = mode === 'q' ? 'quarterly' : 'annual';
    const chartData = d.charts[modeKey][metric]; // [{date, value}, ...]

    renderModalChart(chartData, metric);
}

function renderModalChart(data, metric) {
    const ctx = document.getElementById('modalChartCanvas').getContext('2d');

    if (financialChartInstances.Modal) {
        financialChartInstances.Modal.destroy();
    }

    if (!data || data.length === 0) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '48px Inter'; // Much larger
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Data', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const labels = data.map(d => {
        const parts = d.date.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);

        if (currentModalPeriod === 'q') {
            const q = Math.ceil(month / 3);
            return `Q${q} ${year}`;
        } else {
            const shortYear = year.toString().slice(-2);
            return `FY${shortYear}`;
        }
    });
    const values = data.map(d => d.value);

    // Custom Plugin for connecting lines and labels with hover effect
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

function renderChart(data, symbol, colorOverride = null) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const labels = data.map(d => d.date);
    const prices = data.map(d => d.close);

    if (stockChart) {
        stockChart.destroy();
    }

    // Determine color based on price change or override
    let chartColor;
    if (colorOverride) {
        chartColor = colorOverride;
    } else {
        const startPrice = prices[0];
        const endPrice = prices[prices.length - 1];
        const isPositive = endPrice >= startPrice;
        chartColor = isPositive ? '#00E396' : '#ff4560';
    }

    // Create gradient with dynamic color
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    // Convert hex to rgba for gradient
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
                borderColor: chartColor, // Dynamic Color
                backgroundColor: gradient, // Dynamic Gradient
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

let allHoldings = [];
let sortConfig = { key: 'name', direction: 'asc' }; // Added back for Holdings
let allWatchlist = [];
let watchlistSortConfig = { key: 'name', direction: 'asc' };


function renderWatchlistTable() {
    const watchlistBody = document.getElementById('watchlistBody');
    if (!watchlistBody) return;

    // Apply Sorting
    const sorted = [...allWatchlist].sort((a, b) => {
        let valA = a[watchlistSortConfig.key];
        let valB = b[watchlistSortConfig.key];

        // Handle alphabetical sorting for 'name'
        if (watchlistSortConfig.key === 'name') {
            valA = (a.name || a.symbol).toLowerCase();
            valB = (b.name || b.symbol).toLowerCase();
            if (valA < valB) return watchlistSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return watchlistSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }

        // Handle numeric sorting
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return watchlistSortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    watchlistBody.innerHTML = '';
    sorted.forEach(stock => {
        const tr = document.createElement('tr');
        const weekChange = stock.week_change !== undefined ? stock.week_change : "-";
        const weekChangeVal = (weekChange !== "-" && !isNaN(parseFloat(weekChange)))
            ? (parseFloat(weekChange) >= 0 ? `+${parseFloat(weekChange).toFixed(2)}%` : `${parseFloat(weekChange).toFixed(2)}%`)
            : "-";
        const weekChangeClass = weekChange !== "-" ? (weekChange >= 0 ? 'text-green' : 'text-red') : '';

        const priceVal = (stock.current_price !== null && stock.current_price !== undefined && stock.current_price !== "-")
            ? `$${Number(stock.current_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : "-";

        tr.innerHTML = `
            <td>
                <div class="asset-color-bar" style="background-color: ${stock.color || '#555'}"></div>
                <div class="asset-info" style="cursor: pointer;" onclick="window.location.href='index.html?symbol=${stock.symbol}'">
                    <span class="asset-ticker">${stock.symbol}</span>
                    <span class="asset-name">${stock.name || stock.symbol}</span>
                </div>
            </td>
            <td>${priceVal}</td>
            <td>${stock.forward_pe !== undefined && stock.forward_pe !== null ? stock.forward_pe : "-"}</td>
            <td>${stock.beta !== undefined && stock.beta !== null ? stock.beta : "-"}</td>
            <td class="${weekChangeClass}">${weekChangeVal}</td>

        `;
        watchlistBody.appendChild(tr);
    });

    // Update Sort Icons
    const headers = watchlistBody.closest('table').querySelectorAll('.sortable');
    headers.forEach(header => {
        const key = header.getAttribute('data-sort');
        const iconInfo = header.querySelector('.sort-icon');
        if (iconInfo) {
            if (watchlistSortConfig.key === key) {
                iconInfo.textContent = watchlistSortConfig.direction === 'asc' ? '▲' : '▼';
                header.style.color = 'var(--text-color)';
            } else {
                iconInfo.textContent = '';
                header.style.color = 'var(--text-muted)';
            }
        }
    });
}

async function fetchWatchlist() {
    const watchlistBody = document.getElementById('watchlistBody');
    if (!watchlistBody) return;

    watchlistBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding: 40px;">Loading Watchlist...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/watchlist`);
        if (!response.ok) throw new Error('Failed to fetch watchlist');

        const data = await response.json();
        allWatchlist = data.watchlist || [];
        renderWatchlistTable();

        // Add sorting listeners
        const table = watchlistBody.closest('table');
        if (table) {
            const headers = table.querySelectorAll('.sortable');
            headers.forEach(header => {
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
            });
        }

    } catch (error) {
        console.error('Error loading watchlist:', error);
        watchlistBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--accent-red); padding: 40px;">Error loading watchlist</td></tr>';
    }
}




function renderHoldingsTable() {
    const holdingsBody = document.getElementById('holdingsBody');
    if (!holdingsBody) return;

    // Apply Sorting
    const sorted = [...allHoldings].sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle alphabetical sorting for 'name'
        if (sortConfig.key === 'name') {
            valA = (a.name || a.symbol).toLowerCase();
            valB = (b.name || b.symbol).toLowerCase();
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }

        // Check if the value is numeric (remove %, $ symbols for correct sorting)
        if (['weight', 'week_change', 'market_cap', 'pe_ratio', 'current_price', 'target_price', 'forward_pe', 'beta'].includes(sortConfig.key)) {
            valA = parseFloat(String(valA).replace(/[^0-9.-]/g, ''));
            valB = parseFloat(String(valB).replace(/[^0-9.-]/g, ''));
        }
        // Handle numeric sorting for others (weight, current_price, etc.)
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    holdingsBody.innerHTML = '';
    sorted.forEach(stock => {
        const tr = document.createElement('tr');
        const weekChange = stock.week_change !== undefined ? stock.week_change : "-";
        const weekChangeVal = (weekChange !== "-" && !isNaN(parseFloat(weekChange)))
            ? (parseFloat(weekChange) >= 0 ? `+${parseFloat(weekChange).toFixed(2)}%` : `${parseFloat(weekChange).toFixed(2)}%`)
            : "-";
        const weekChangeClass = weekChange !== "-" ? (weekChange >= 0 ? 'text-green' : 'text-red') : '';

        const priceVal = (stock.current_price !== null && stock.current_price !== undefined && stock.current_price !== "-")
            ? `$${Number(stock.current_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : "-";
        const weightVal = (stock.weight !== null && stock.weight !== undefined) ? `${stock.weight}%` : "0%";

        tr.innerHTML = `
            <td>
                <div class="asset-color-bar" style="background-color: ${stock.color || '#555'}"></div>
                <div class="asset-info" style="cursor: pointer;" onclick="window.location.href='index.html?symbol=${stock.symbol}'">
                    <span class="asset-ticker">${stock.symbol}</span>
                    <span class="asset-name">${stock.name || stock.symbol}</span>
                </div>
            </td>
            <td>${priceVal}</td>
            <td>${weightVal}</td>
            <td>$${stock.target_price || "-"}</td>
            <td class="${weekChangeClass}">${weekChangeVal}</td>
            <td>${stock.forward_pe !== undefined && stock.forward_pe !== null ? stock.forward_pe : "-"}</td>
            <td>${stock.beta !== undefined && stock.beta !== null ? stock.beta : "-"}</td>
        `;

        holdingsBody.appendChild(tr);
    });

    // Update Sort Icons
    document.querySelectorAll('.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        const key = th.getAttribute('data-sort');
        if (key === sortConfig.key) {
            icon.textContent = sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        } else {
            icon.textContent = '';
        }
    });
}


async function fetchHoldings() {
    const holdingsBody = document.getElementById('holdingsBody');
    if (!holdingsBody) return;

    const searchInput = document.getElementById('searchInput');

    // Loading State
    document.body.style.cursor = 'wait';
    if (searchInput) {
        searchInput.disabled = true;
        searchInput.placeholder = "Loading Portfolio...";
    }
    holdingsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 40px;">Loading Holdings...</td></tr>';

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
        holdingsBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: #ff4560; padding: 20px;">Error loading holdings. Please try again.</td></tr>`;
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No holdings found.</td></tr>';
        return;
    }

    holdings.forEach(h => {
        const tr = document.createElement('tr');
        const changeClass = (h.week_change >= 0) ? 'positive' : 'negative';
        const changeColor = (h.week_change >= 0) ? '#00E396' : '#ff4560';
        const changeSign = (h.week_change >= 0) ? '+' : '';
        const price = h.current_price !== '-' ? '$' + parseFloat(h.current_price).toFixed(2) : '-';

        tr.innerHTML = `
            <td class="symbol-cell">
                <div class="logo-box" style="background-color: ${h.color || '#333'}">${h.symbol[0]}</div>
                <div>
                    <div style="font-weight:bold;">${h.symbol}</div>
                    <div style="font-size:0.8em; color:var(--text-muted);">${h.name}</div>
                </div>
            </td>
            <td>${price}</td>
            <td style="color: ${changeColor}">${changeSign}${h.week_change}%</td>
            <td>${h.weight}%</td>
        `;
        tbody.appendChild(tr);
    });
}


function setupPortfolioIntervals() {
    const container = document.getElementById('portfolioTimeIntervals');
    if (!container) return;

    const intervals = container.querySelectorAll('.time-interval');
    intervals.forEach(span => {
        span.onclick = () => {
            // UI toggle
            intervals.forEach(i => i.classList.remove('active'));
            span.classList.add('active');

            // Fetch
            const period = span.getAttribute('data-period');
            updatePortfolioChart(period);
        };
    });
}

async function updatePortfolioChart(period) {
    try {
        // Optional: Add loading indicator on chart canvas
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

let portfolioChartInstance = null;

function renderPortfolioChart(data) {
    const ctx = document.getElementById('portfolioChart');
    if (!ctx) return;

    const context = ctx.getContext('2d');
    const labels = data.map(d => d.date);
    const values = data.map(d => d.value);

    if (portfolioChartInstance) {
        portfolioChartInstance.destroy();
    }

    // Determine color based on trend (First vs Last)
    const startVal = values[0];
    const endVal = values[values.length - 1];

    // Calculate total change
    const totalChange = endVal;

    // Safety check for NaN
    const displayChange = isNaN(totalChange) ? 0 : totalChange;

    const isPositive = displayChange >= 0;
    const chartColor = isPositive ? '#00E396' : '#ff4560';

    // Update Portfolio Change Text
    const changeElement = document.getElementById('portfolioChange');
    if (changeElement) {
        const sign = isPositive ? '+' : '';
        changeElement.textContent = `${sign}${displayChange.toFixed(2)}%`;
        changeElement.style.color = chartColor;
    }

    // Create gradient
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
                    callbacks: {
                        label: function (context) {
                            return 'Return: ' + context.parsed.y.toFixed(2) + '%';
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 6, maxRotation: 0 }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: { color: '#374151', drawBorder: false },
                    ticks: {
                        color: '#6b7280',
                        callback: function (value) { return value.toFixed(1) + '%'; }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
    const labels = data.map(d => d.date);
            const values = data.map(d => d.value);

            if(portfolioChartInstance) {
                portfolioChartInstance.destroy();
            }

    // Determine color based on trend (First vs Last)
    const startVal = values[0];
            const endVal = values[values.length - 1];

            // Calculate total change
            const totalChange = endVal;

            // Safety check for NaN
            const displayChange = isNaN(totalChange) ? 0 : totalChange;

            const isPositive = displayChange >= 0;
            const chartColor = isPositive ? '#00E396' : '#ff4560';

            // Update Portfolio Change Text
            const changeElement = document.getElementById('portfolioChange');
            if(changeElement) {
                const sign = isPositive ? '+' : '';
                changeElement.textContent = `${sign}${displayChange.toFixed(2)} % `;
                changeElement.style.color = chartColor;
            }

    // Create gradient
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
                            callbacks: {
                                label: function (context) {
                                    return 'Return: ' + context.parsed.y.toFixed(2) + '%';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: { display: false, drawBorder: false },
                            ticks: { color: '#6b7280', maxTicksLimit: 6, maxRotation: 0 }
                        },
                        y: {
                            display: true,
                            position: 'right',
                            grid: { color: '#374151', drawBorder: false },
                            ticks: {
                                color: '#6b7280',
                                callback: function (value) { return value.toFixed(1) + '%'; }
                            }
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


async function fetchWatchlist() {
        const watchlistBody = document.getElementById('watchlistBody');
        if(!watchlistBody) return;

        // Simple checks
        if(watchlistBody.children.length === 0) {
        watchlistBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">Loading Watchlist...</td></tr>';
    }

    try {
        const response = await fetch(`${API_BASE_URL} / api / watchlist`);
        if (!response.ok) throw new Error('Failed to fetch watchlist');

        const data = await response.json();
        const watchlist = data.watchlist || [];

        watchlistBody.innerHTML = '';
        if (watchlist.length === 0) {
            watchlistBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Your watchlist is empty.</td></tr>';
            return;
        }

        watchlist.forEach(item => {
            const tr = document.createElement('tr');
            const price = item.current_price ? `$${parseFloat(item.current_price).toFixed(2)
                } ` : '-';
            const change = parseFloat(item.change || 0);
            const changeColor = change >= 0 ? '#00E396' : '#ff4560';
            const changeSign = change >= 0 ? '+' : '';

            tr.innerHTML = `
    < td class="symbol-cell" >
                    <div class="logo-box" style="background-color: #333">${item.symbol[0]}</div>
                    <div>
                        <div style="font-weight:bold;">${item.symbol}</div>
                        <div style="font-size:0.8em; color:var(--text-muted);">${item.name || ''}</div>
                    </div>
                </td >
                <td>${price}</td>
                <td style="color: ${changeColor}">${changeSign}${change.toFixed(2)}%</td>
                <td><button class="btn-icon delete-btn" style="background:transparent; border:none; color:#ea4335; cursor:pointer;" onclick="removeFromWatchlist('${item.symbol}')"><i class="fas fa-trash"></i></button></td>
`;
            watchlistBody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error fetching watchlist:', error);
        watchlistBody.innerHTML = `< tr > <td colspan="5" style="text-align:center; color: #ff4560; padding: 20px;">Error loading watchlist.</td></tr > `;
    }
}

async function removeFromWatchlist(symbol) {
    if (!confirm(`Remove ${symbol} from watchlist ? `)) return;

    try {
        const response = await fetch(`${API_BASE_URL} /api/watchlist ? symbol = ${symbol} `, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchWatchlist();
        } else {
            alert('Failed to remove stock');
        }
    } catch (error) {
        console.error('Error removing from watchlist:', error);
    }
}

// Initialization and Refresh
document.addEventListener('DOMContentLoaded', () => {
    fetchHoldings();
    fetchWatchlist();

    setInterval(() => {
        fetchHoldings();
        fetchWatchlist();
    }, 60000);
});
```
