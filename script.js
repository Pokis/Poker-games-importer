// Global State
let allHands = [];
let profitChartInstance = null;
let profitBbChartInstance = null;
let gameTypeChartInstance = null;
let selectedGameTypes = new Set();

// DOM Elements
const formatFilter = document.getElementById('format-filter');
const gameTypesList = document.getElementById('game-types-list');
const selectAllBtn = document.getElementById('select-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const buyinMinInput = document.getElementById('buyin-min');
const buyinMaxInput = document.getElementById('buyin-max');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdatedText = document.getElementById('last-updated');

const valTotalHands = document.getElementById('val-total-hands');
const valNetChips = document.getElementById('val-net-chips');
const valNetBb = document.getElementById('val-net-bb');
const valRake = document.getElementById('val-rake');

// Event Listeners
refreshBtn.addEventListener('click', fetchData);
formatFilter.addEventListener('change', updateDashboard);
selectAllBtn.addEventListener('click', selectAllGameTypes);
clearAllBtn.addEventListener('click', clearAllGameTypes);
buyinMinInput.addEventListener('input', updateDashboard);
buyinMaxInput.addEventListener('input', updateDashboard);

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
        
        // Sort hands by hand_number sequentially
        allHands.sort((a, b) => {
            const numA = Number(a.hand_number) || 0;
            const numB = Number(b.hand_number) || 0;
            return numA - numB;
        });
        
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
    
    // Clear the current checkboxes in list
    gameTypesList.innerHTML = '';
    
    const sortedTypes = Array.from(types).sort();
    
    // Initialize selectedGameTypes with all found types if empty
    if (selectedGameTypes.size === 0) {
        sortedTypes.forEach(t => selectedGameTypes.add(t));
    }
    
    sortedTypes.forEach(type => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = type;
        checkbox.checked = selectedGameTypes.has(type);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedGameTypes.add(type);
            } else {
                selectedGameTypes.delete(type);
            }
            updateDashboard();
        });
        
        const span = document.createElement('span');
        span.textContent = type;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        gameTypesList.appendChild(label);
    });
}

function selectAllGameTypes() {
    const checkboxes = gameTypesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        selectedGameTypes.add(cb.value);
    });
    updateDashboard();
}

function clearAllGameTypes() {
    const checkboxes = gameTypesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
        selectedGameTypes.delete(cb.value);
    });
    updateDashboard();
}

function updateDashboard() {
    if (allHands.length === 0) return;

    // Filter Data
    const selectedFormat = formatFilter.value;
    const minBuyin = parseFloat(buyinMinInput.value);
    const maxBuyin = parseFloat(buyinMaxInput.value);

    let filtered = allHands.filter(h => {
        let matchFormat = true;
        if (selectedFormat === 'Tournament') matchFormat = h.tournament_number !== 'CASH';
        if (selectedFormat === 'Cash') matchFormat = h.tournament_number === 'CASH';
        
        const matchType = selectedGameTypes.has(h.game_type);
        
        let matchBuyin = true;
        if (!isNaN(minBuyin) && h.buy_in < minBuyin) matchBuyin = false;
        if (!isNaN(maxBuyin) && h.buy_in > maxBuyin) matchBuyin = false;
        
        return matchFormat && matchType && matchBuyin;
    });

    // Update Metrics
    updateMetrics(filtered);
    
    // Update Charts
    updateProfitChart(filtered);
    updateProfitBbChart(filtered);
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
    let showdownCumulative = 0;
    let nonShowdownCumulative = 0;
    
    const dataPoints = [];
    const showdownData = [];
    const nonShowdownData = [];
    
    hands.forEach(h => {
        const net = h.net_result_chips || 0;
        cumulative += net;
        if (h.showdown) {
            showdownCumulative += net;
        } else {
            nonShowdownCumulative += net;
        }
        dataPoints.push(cumulative);
        showdownData.push(showdownCumulative);
        nonShowdownData.push(nonShowdownCumulative);
    });

    const labels = hands.map((h, i) => `Hand ${i+1} (ID: ${h.hand_number})`);

    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Overall Net (Chips)',
                    data: dataPoints,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Showdown Winnings',
                    data: showdownData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Non-Showdown Winnings',
                    data: nonShowdownData,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    display: false
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

function updateProfitBbChart(hands) {
    const ctx = document.getElementById('profitBbChart').getContext('2d');
    
    let cumulative = 0;
    let showdownCumulative = 0;
    let nonShowdownCumulative = 0;
    
    const dataPoints = [];
    const showdownData = [];
    const nonShowdownData = [];
    
    hands.forEach(h => {
        const net = h.net_result_bb || 0;
        cumulative += net;
        if (h.showdown) {
            showdownCumulative += net;
        } else {
            nonShowdownCumulative += net;
        }
        dataPoints.push(cumulative);
        showdownData.push(showdownCumulative);
        nonShowdownData.push(nonShowdownCumulative);
    });

    const labels = hands.map((h, i) => `Hand ${i+1} (ID: ${h.hand_number})`);

    if (profitBbChartInstance) {
        profitBbChartInstance.destroy();
    }

    profitBbChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Overall Net (BB)',
                    data: dataPoints,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Showdown Winnings',
                    data: showdownData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Non-Showdown Winnings',
                    data: nonShowdownData,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    display: false
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
