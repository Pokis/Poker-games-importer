// Global State
let allHands = [];
let profitChartInstance = null;
let gameTypeChartInstance = null;

// DOM Elements
const formatFilter = document.getElementById('format-filter');
const gameTypeFilter = document.getElementById('game-type-filter');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdatedText = document.getElementById('last-updated');

const valTotalHands = document.getElementById('val-total-hands');
const valNetChips = document.getElementById('val-net-chips');
const valNetBb = document.getElementById('val-net-bb');
const valRake = document.getElementById('val-rake');

// Event Listeners
refreshBtn.addEventListener('click', fetchData);
formatFilter.addEventListener('change', updateDashboard);
gameTypeFilter.addEventListener('change', updateDashboard);

// Setup Chart Colors
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";

// Initialize
fetchData();

async function fetchData() {
    try {
        refreshBtn.textContent = 'Loading...';
        refreshBtn.disabled = true;
        
        const response = await fetch('/api/hands');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        allHands = await response.json();
        
        // Populate game type dropdown
        populateGameTypes(allHands);
        
        updateDashboard();
        
        const now = new Date();
        lastUpdatedText.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        
    } catch (error) {
        console.error("Could not fetch data:", error);
        lastUpdatedText.textContent = "Error loading data. Make sure server is running and database exists.";
    } finally {
        refreshBtn.textContent = 'Refresh Data';
        refreshBtn.disabled = false;
    }
}

function populateGameTypes(hands) {
    const types = new Set();
    hands.forEach(h => {
        if (h.game_type) types.add(h.game_type);
    });
    
    // Keep the "All" option, remove the rest
    while (gameTypeFilter.options.length > 1) {
        gameTypeFilter.remove(1);
    }
    
    Array.from(types).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        gameTypeFilter.appendChild(option);
    });
}

function updateDashboard() {
    if (allHands.length === 0) return;

    // Filter Data
    const selectedFormat = formatFilter.value;
    const selectedGameType = gameTypeFilter.value;

    let filtered = allHands.filter(h => {
        let matchFormat = true;
        if (selectedFormat === 'Tournament') matchFormat = h.tournament_number !== 'CASH';
        if (selectedFormat === 'Cash') matchFormat = h.tournament_number === 'CASH';
        
        let matchType = true;
        if (selectedGameType !== 'All') matchType = h.game_type === selectedGameType;
        
        return matchFormat && matchType;
    });

    // Update Metrics
    updateMetrics(filtered);
    
    // Update Charts
    updateProfitChart(filtered);
    updateGameTypeChart(filtered);
}

function formatCurrency(val) {
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return isNegative ? `-${formatted}` : `+${formatted}`;
}

function setMetricValue(el, val, isCurrency = false) {
    el.textContent = isCurrency ? formatCurrency(val) : val.toLocaleString();
    
    // Apply colors if it's a financial metric
    if (isCurrency) {
        el.className = 'metric-value'; // reset
        if (val > 0) el.classList.add('positive');
        else if (val < 0) el.classList.add('negative');
    }
}

function updateMetrics(hands) {
    let totalChips = 0;
    let totalBb = 0;
    let totalRake = 0;
    
    hands.forEach(h => {
        totalChips += (h.net_result_chips || 0);
        totalBb += (h.net_result_bb || 0);
        totalRake += (h.rake || 0);
    });

    setMetricValue(valTotalHands, hands.length);
    setMetricValue(valNetChips, totalChips, true);
    setMetricValue(valNetBb, totalBb, true);
    setMetricValue(valRake, totalRake, true);
}

function updateProfitChart(hands) {
    const ctx = document.getElementById('profitChart').getContext('2d');
    
    let cumulative = 0;
    const dataPoints = hands.map((h, i) => {
        cumulative += (h.net_result_chips || 0);
        return cumulative;
    });

    const labels = hands.map((_, i) => `Hand ${i+1}`);
    
    const isPositive = cumulative >= 0;
    const borderColor = isPositive ? '#10b981' : '#ef4444';
    const bgColor = isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Net (Chips)',
                data: dataPoints,
                borderColor: borderColor,
                backgroundColor: bgColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
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
                }
            },
            scales: {
                x: {
                    display: false // hide individual hand labels for clean look
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
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

function updateGameTypeChart(hands) {
    const ctx = document.getElementById('gameTypeChart').getContext('2d');
    
    // Aggregate profit by game type
    const aggregated = {};
    hands.forEach(h => {
        const type = h.game_type || 'Unknown';
        if (!aggregated[type]) aggregated[type] = 0;
        aggregated[type] += (h.net_result_chips || 0);
    });
    
    // Sort by profit descending
    const sortedTypes = Object.keys(aggregated).sort((a, b) => aggregated[b] - aggregated[a]);
    const dataPoints = sortedTypes.map(t => aggregated[t]);
    
    const backgroundColors = dataPoints.map(val => val >= 0 ? '#10b981' : '#ef4444');

    if (gameTypeChartInstance) {
        gameTypeChartInstance.destroy();
    }

    gameTypeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedTypes,
            datasets: [{
                label: 'Net Profit (Chips)',
                data: dataPoints,
                backgroundColor: backgroundColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}
