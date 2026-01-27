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

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://YOUR_BACKEND_URL_HERE'; // TODO: Replace with your actual deployed backend URL after deployment

async function fetchStockData(symbol, period = '1d') {
    if (!symbol) return;
    const symbolClean = symbol.toUpperCase();

    let quoteData = null;
    let historyData = null;
    let statisticsData = null;

    try {
        // Parallel requests: Quote, History, and Statistics
        const [quoteRes, historyRes, statsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/quote/${symbolClean}`),
            fetch(`${API_BASE_URL}/api/history/${symbolClean}?period=${period}`),
            fetch(`${API_BASE_URL}/api/statistics/${symbolClean}`)
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

        if (statsRes.ok) {
            statisticsData = await statsRes.json();
        }

        if (quoteData && !quoteData.error) {
            updateHeaderInfo(quoteData, historyData, period);
        }

        if (statisticsData && !statisticsData.error) {
            updateFinancials(statisticsData);
        }

    } catch (error) {
        console.error('Data fetch error:', error);
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
