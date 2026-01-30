import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import "./style.css";

const BACKEND_BASE = "http://127.0.0.1:3333";
const STORAGE_KEY_SEARCH = 'earthquake_search_history';
const STORAGE_KEY_CHAT = 'earthquake_chat_history';

// --- 1. 定义地图底图 (Base Layers) ---
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
});

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "© Esri",
  }
);

const darkMatter = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "© CartoDB",
  }
);

// --- 2. 初始化地图 & 图层控件 ---
const map = L.map("map", {
  center: [20, 0],
  zoom: 2,
  layers: [osm],
  zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const baseMaps = {
  "普通地图": osm,
  "卫星图像": satellite,
  "深色模式": darkMatter,
};
L.control.layers(baseMaps).addTo(map);

// --- 全局变量 ---
let earthquakeLayer = null;
let bboxLayer = null;
let currentFeatures = [];
let chatHistory = [];
let lastQueryContext = null;

// Chart instances
let magChart = null;
let depthChart = null;

// Heatmap layer
let heatLayer = null;
let isHeatmapMode = false;

// --- 辅助函数 ---
function colorByMag(mag) {
  if (mag >= 7) return "#7a0177";
  if (mag >= 6) return "#ae017e";
  if (mag >= 5) return "#dd3497";
  if (mag >= 4) return "#f768a1";
  if (mag >= 3) return "#fa9fb5";
  return "#fcc5c0";
}

function radiusByMag(mag) {
  return mag ? Math.max(3, mag * 2.5) : 4;
}

function formatTime(ms) {
  return new Date(ms).toLocaleString();
}

function formatMag(mag) {
  if (mag === null || mag === undefined || isNaN(mag)) return '-';
  return Number(mag).toFixed(2);
}

function formatDepthValue(depth) {
  if (depth === null || depth === undefined || isNaN(depth)) return '-';
  return Number(depth).toFixed(2);
}

// Convert GeoJSON features to heatmap points [lat, lon, intensity]
function getHeatmapPoints(features) {
  return features.map(f => {
    const coords = f.geometry.coordinates; // [lon, lat, depth]
    const mag = f.properties.mag || 0;
    // Intensity calculation: Normalize mag (e.g., mag 5 -> 0.62, mag 8 -> 1.0)
    // Adjusted formula for better visibility
    const intensity = Math.max(0.3, mag / 8.0);
    return [coords[1], coords[0], intensity];
  });
}

function formatMagRange(plan) {
  if (plan.mag_phrase) return `描述为"${plan.mag_phrase}"`;
  if (plan.minmagnitude && plan.maxmagnitude) return `${plan.minmagnitude} - ${plan.maxmagnitude} 级`;
  if (plan.minmagnitude) return `≥ ${plan.minmagnitude} 级`;
  if (plan.maxmagnitude) return `≤ ${plan.maxmagnitude} 级`;
  return "全部震级";
}

function formatLocation(plan) {
  if (
    plan.minlatitude != null &&
    plan.maxlatitude != null &&
    plan.minlongitude != null &&
    plan.maxlongitude != null
  ) {
    const fmt = (n) => n.toFixed(1);
    return `区域 [${fmt(plan.minlatitude)}, ${fmt(plan.minlongitude)}] 到 [${fmt(plan.maxlatitude)}, ${fmt(plan.maxlongitude)}]`;
  }
  return "🌍 全球范围";
}

function formatDepth(plan) {
  if (plan.mindepth != null && plan.maxdepth != null) return `${plan.mindepth} - ${plan.maxdepth} km`;
  if (plan.mindepth != null) return `> ${plan.mindepth} km`;
  if (plan.maxdepth != null) return `< ${plan.maxdepth} km`;
  return "不限深度";
}

// Update the last query context when a search is performed
function updateQueryContext(userQuery, plan, geojson, stats) {
  const features = geojson.features || [];

  // Sort by magnitude (descending) and prepare data
  const sortedFeatures = [...features]
    .sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0));

  // Build feature summaries for AI
  const featureSummaries = sortedFeatures.map((f, index) => {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    const depth = coords[2];
    const time = new Date(p.time).toLocaleString('zh-CN');
    return {
      rank: index + 1,
      place: p.place || 'Unknown',
      mag: formatMag(p.mag),
      depth: formatDepthValue(depth),
      time: time,
      lat: coords[1],
      lon: coords[0]
    };
  });

  // Store context
  lastQueryContext = {
    userQuery: userQuery,
    timestamp: new Date().toLocaleString('zh-CN'),
    region: formatLocation(plan),
    timeRange: plan.starttime
      ? `${plan.starttime.split('T')[0]} 至 ${plan.endtime ? plan.endtime.split('T')[0] : '现在'}`
      : `过去 ${plan.window_value} ${plan.window_unit === 'hours' ? '小时' : '天'}`,
    totalCount: stats.count,
    maxMagnitude: formatMag(stats.max_magnitude),
    features: featureSummaries
  };

  console.log('Query context updated:', lastQueryContext);
}

// Build a context-aware message for the AI
function buildContextAwareMessage(userMessage) {
  if (!lastQueryContext || lastQueryContext.totalCount === 0) {
    return {
      hasContext: false,
      content: userMessage
    };
  }

  const featureList = lastQueryContext.features.map(f =>
    `${f.rank}. ${f.place} | 震级:${f.mag} | 深度:${f.depth}km | 时间:${f.time}`
  ).join('\n');

  const contextMessage = `【当前地图上的地震数据背景】
用户查询：${lastQueryContext.userQuery}
查询时间：${lastQueryContext.timestamp}
时间范围：${lastQueryContext.timeRange}
查询区域：${lastQueryContext.region}
结果统计：共 ${lastQueryContext.totalCount} 次地震，最大震级 ${lastQueryContext.maxMagnitude}

详细数据列表（按震级排序）：
${featureList}

---
【用户当前问题】：${userMessage}`;

  return {
    hasContext: true,
    content: contextMessage
  };
}

// Calculate magnitude distribution (5 categories based on USGS standards)
function calculateMagDistribution(features) {
  const distribution = {
    'Minor (<4.0)': 0,
    'Light (4-5)': 0,
    'Moderate (5-6)': 0,
    'Strong (6-7)': 0,
    'Major (≥7)': 0
  };

  features.forEach(f => {
    const mag = f.properties?.mag;
    if (mag === null || mag === undefined) return;

    if (mag < 4.0) distribution['Minor (<4.0)']++;
    else if (mag < 5.0) distribution['Light (4-5)']++;
    else if (mag < 6.0) distribution['Moderate (5-6)']++;
    else if (mag < 7.0) distribution['Strong (6-7)']++;
    else distribution['Major (≥7)']++;
  });

  return distribution;
}

// Calculate depth distribution (3 categories based on IASPEI standards)
function calculateDepthDistribution(features) {
  const distribution = {
    'Shallow (0-70km)': 0,
    'Intermediate (70-300km)': 0,
    'Deep (>300km)': 0
  };

  features.forEach(f => {
    const depth = f.geometry?.coordinates?.[2];
    if (depth === null || depth === undefined) return;

    if (depth <= 70) distribution['Shallow (0-70km)']++;
    else if (depth <= 300) distribution['Intermediate (70-300km)']++;
    else distribution['Deep (>300km)']++;
  });

  return distribution;
}

// Render doughnut charts
function renderCharts(features) {
  const magDistribution = calculateMagDistribution(features);
  const depthDistribution = calculateDepthDistribution(features);

  // Magnitude chart colors (warm colors: gray to red to purple)
  const magColors = ['#d9d9d9', '#fee08b', '#fc8d59', '#e34a33', '#7a0177'];

  // Depth chart colors (cool colors: orange, blue, dark blue)
  const depthColors = ['#fc8d59', '#4575b4', '#313695'];

  // Destroy existing charts if they exist
  if (magChart) {
    magChart.destroy();
    magChart = null;
  }
  if (depthChart) {
    depthChart.destroy();
    depthChart = null;
  }

  // Get canvas elements
  const magCtx = document.getElementById('mag-chart');
  const depthCtx = document.getElementById('depth-chart');

  if (!magCtx || !depthCtx) return;

  // Chart options (shared)
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  // Create magnitude chart
  magChart = new Chart(magCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(magDistribution),
      datasets: [{
        data: Object.values(magDistribution),
        backgroundColor: magColors,
        borderWidth: 1,
        borderColor: '#fff'
      }]
    },
    options: chartOptions
  });

  // Create depth chart
  depthChart = new Chart(depthCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(depthDistribution),
      datasets: [{
        data: Object.values(depthDistribution),
        backgroundColor: depthColors,
        borderWidth: 1,
        borderColor: '#fff'
      }]
    },
    options: chartOptions
  });
}

// Setup collapsible section toggles
function setupCollapsibles() {
  const toggleButtons = document.querySelectorAll('.collapsible-header');

  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      const content = button.nextElementSibling;
      const isHidden = content.classList.contains('hidden');

      // Toggle the content
      content.classList.toggle('hidden');

      // Toggle the active class for icon rotation
      button.classList.toggle('active', isHidden);
    });
  });
}

// --- Chat Functions ---
function addChatBubble(role, text) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user" : "ai"}`;
  bubble.textContent = text;
  container.appendChild(bubble);

  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const text = input.value.trim();

  if (!text) return;

  // Disable input while processing
  input.disabled = true;
  sendBtn.disabled = true;

  // Show user message in UI (original text, not the context-enhanced version)
  addChatBubble("user", text);
  input.value = "";

  // Build context-aware message
  const contextResult = buildContextAwareMessage(text);

  // Add to history (use the context-enhanced content for AI, but store original for display)
  chatHistory.push({ role: "user", content: contextResult.content, displayContent: text });

  // Save to localStorage
  saveChatHistory();

  // Show loading indicator
  const container = document.getElementById("chat-messages");
  const loadingBubble = document.createElement("div");
  loadingBubble.className = "chat-bubble loading";
  loadingBubble.textContent = "思考中...";
  loadingBubble.id = "chat-loading";
  container.appendChild(loadingBubble);
  container.scrollTop = container.scrollHeight;

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });

    // Remove loading indicator
    document.getElementById("chat-loading")?.remove();

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();

    // Show AI response
    addChatBubble("ai", data.reply);

    // Add AI response to history
    chatHistory.push({ role: "assistant", content: data.reply });

    // Save to localStorage
    saveChatHistory();

  } catch (e) {
    document.getElementById("chat-loading")?.remove();
    addChatBubble("ai", "抱歉，出现了网络错误，请稍后再试。");
    console.error("Chat error:", e);
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// Save chat history to localStorage
function saveChatHistory() {
  try {
    localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(chatHistory));
  } catch (e) {
    console.error('Error saving chat history:', e);
  }
}

// Load chat history from localStorage
function loadChatHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CHAT);
    if (saved) {
      chatHistory = JSON.parse(saved);
      return true;
    }
  } catch (e) {
    console.error('Error loading chat history:', e);
  }
  return false;
}

// Clear chat history
function clearChatHistory() {
  chatHistory = [];
  localStorage.removeItem(STORAGE_KEY_CHAT);

  const container = document.getElementById('chat-messages');
  if (container) {
    container.innerHTML = '';
    // Add back the default welcome message
    addChatBubble('ai', '你好！我是地震知识助手，有什么关于地震的问题都可以问我。');
  }
}

// Initialize chat from localStorage
function initializeChat() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Clear default welcome message from HTML
  container.innerHTML = '';

  // Try to load saved history
  if (loadChatHistory() && chatHistory.length > 0) {
    // Restore chat bubbles
    chatHistory.forEach(msg => {
      // For user messages, use displayContent if available (original text without context)
      const displayText = msg.displayContent || msg.content;
      const role = msg.role === 'assistant' ? 'ai' : msg.role;
      addChatBubble(role, displayText);
    });
  } else {
    // Show default welcome message
    addChatBubble('ai', '你好！我是地震知识助手，有什么关于地震的问题都可以问我。');
  }
}

// --- 渲染逻辑 ---
function renderGeoJSON(geojson, plan) {
  // 1. Clear ALL existing layers
  if (earthquakeLayer) {
    map.removeLayer(earthquakeLayer);
    earthquakeLayer = null;
  }
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (bboxLayer) {
    map.removeLayer(bboxLayer);
    bboxLayer = null;
  }

  const features = geojson.features || [];

  // 2. Render based on current mode
  if (isHeatmapMode) {
    // --- Heatmap Mode ---
    const points = getHeatmapPoints(features);
    heatLayer = L.heatLayer(points, {
      radius: 35,
      blur: 10,
      maxZoom: 10,
      max: 1.0,
      gradient: {
        0.1: 'blue',
        0.3: 'cyan',
        0.5: 'lime',
        0.7: 'yellow',
        1.0: 'red'
      }
    }).addTo(map);
  } else {
    // --- Normal Marker Mode (Original Logic) ---
    earthquakeLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const mag = feature?.properties?.mag;
        return L.circleMarker(latlng, {
          radius: radiusByMag(mag),
          color: "#fff",
          weight: 1,
          fillColor: colorByMag(mag),
          fillOpacity: 0.8,
        });
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const depth = feature.geometry.coordinates[2];
        layer.bindPopup(
          `<b>${p.place}</b><br/>
           震级: <b>${formatMag(p.mag)}</b><br/>
           深度: <b>${formatDepthValue(depth)}</b> km<br/>
           时间: ${formatTime(p.time)}<br/>
           <a href="${p.url}" target="_blank">USGS详情</a>`
        );
      },
    }).addTo(map);
  }

  // 3. Render BBox (Common for both modes)
  if (
    plan.minlatitude != null &&
    plan.maxlatitude != null &&
    plan.minlongitude != null &&
    plan.maxlongitude != null
  ) {
    const bounds = [
      [plan.minlatitude, plan.minlongitude],
      [plan.maxlatitude, plan.maxlongitude],
    ];
    bboxLayer = L.rectangle(bounds, {
      color: "#ff3333",
      weight: 2,
      dashArray: "5, 10",
      fill: false,
    }).addTo(map);
    map.fitBounds(bounds, { padding: [50, 50] });
  } else {
    // Fit bounds to features (works for both layers)
    try {
      const layer = isHeatmapMode ? heatLayer : earthquakeLayer;
      if (layer && features.length > 0) {
        // HeatLayer doesn't have getBounds, need to calculate manually or skip
        if (!isHeatmapMode) map.fitBounds(layer.getBounds().pad(0.1));
      }
    } catch (e) {}
  }
}

// --- UI 交互 ---
function setLoading(isLoading) {
  const btnText = document.getElementById("btn-text");
  const btnLoader = document.getElementById("btn-loader");
  const btn = document.getElementById("run-nl");

  if (isLoading) {
    btn.disabled = true;
    btnText.textContent = "AI思考中";
    btnLoader.classList.remove("hidden");
  } else {
    btn.disabled = false;
    btnText.textContent = "查询";
    btnLoader.classList.add("hidden");
  }
}

// Update info panel with query results
function updateInfoPanel(payload) {
  const panel = document.getElementById("info-panel");
  const panelIcon = document.getElementById("info-panel-icon");

  panel.classList.remove("hidden");
  if (panelIcon) panelIcon.classList.add("hidden");

  const plan = payload.plan;
  const stats = payload.stats;
  const timing = payload.timing_ms;
  const features = payload.geojson?.features || [];

  // Update main stats
  document.getElementById('stat-count').textContent = stats.count || 0;
  document.getElementById('stat-max-mag').textContent = formatMag(stats.max_magnitude);

  // Render charts
  renderCharts(features);

  // Update AI details
  let timeStr = "";
  if (plan.starttime) {
    const start = plan.starttime.split("T")[0];
    const end = plan.endtime ? plan.endtime.split("T")[0] : "现在";
    timeStr = `${start} 至 ${end}`;
  } else {
    const val = plan.window_value || "?";
    const unit = plan.window_unit === 'hours' ? '小时' : '天';
    timeStr = `过去 ${val} ${unit}`;
  }

  const aiDetailsList = document.getElementById('ai-details-list');
  aiDetailsList.innerHTML = `
    <li><strong>时间:</strong> ${timeStr}</li>
    <li><strong>区域:</strong> ${formatLocation(plan)}</li>
    <li><strong>震级:</strong> ${formatMagRange(plan)}</li>
    <li><strong>深度:</strong> ${formatDepth(plan)}</li>
  `;

  // Update timing info
  const timingInfo = document.getElementById('timing-info');
  timingInfo.innerHTML = `
    ⏱️ 耗时: LLM ${timing.llm}ms + API ${timing.usgs}ms = ${timing.total}ms
    ${payload.cache_hit ? '<span style="color:green;"> (缓存命中)</span>' : ''}
  `;

  // Update earthquake list
  renderList(features.slice(0, 50));

  // Save features for heatmap toggle
  currentFeatures = features;

  // Update query context for chat
  if (typeof updateQueryContext === 'function') {
    updateQueryContext(document.getElementById('nl').value, plan, payload.geojson, stats);
  }
}

// Render earthquake list
function renderList(features) {
  const list = document.getElementById("quake-list");
  if (!list) return;

  list.innerHTML = "";

  if (features.length === 0) {
    list.innerHTML = '<li style="color:#999;padding:10px 0;">暂无数据</li>';
    return;
  }

  features.forEach(f => {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    const depth = coords[2];
    const time = new Date(p.time).toLocaleDateString('zh-CN');

    const li = document.createElement("li");
    li.className = "quake-item";
    li.innerHTML = `
      <span class="quake-mag">${formatMag(p.mag)}</span>
      <span class="quake-place" title="${p.place}">${p.place || 'Unknown'}</span>
      <span class="quake-time">${time}</span>
    `;

    li.addEventListener("click", () => {
      map.flyTo([coords[1], coords[0]], 8);
    });

    list.appendChild(li);
  });
}

// --- 事件绑定 ---

// 1. 最小化面板按钮
document.getElementById("close-info").addEventListener("click", () => {
  minimizeInfoPanel();
});

// 2. 点击最小化图标恢复面板
document.getElementById("info-panel-icon").addEventListener("click", () => {
  restoreInfoPanel();
});

// --- Search History Functions ---
function saveSearchHistory(query) {
  if (!query || !query.trim()) return;

  let history = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SEARCH);
    if (stored) {
      history = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading search history:', e);
  }

  // Remove duplicates
  history = history.filter(item => item !== query);

  // Add new query to the front
  history.unshift(query);

  // Keep only the last 5 items
  history = history.slice(0, 5);

  // Save back to localStorage
  try {
    localStorage.setItem(STORAGE_KEY_SEARCH, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving search history:', e);
  }
}

function showSearchHistory() {
  // Remove existing dropdown if any
  const existingDropdown = document.getElementById('search-history-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }

  // Get history from localStorage
  let history = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SEARCH);
    if (stored) {
      history = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading search history:', e);
  }

  // Don't show dropdown if no history
  if (history.length === 0) return;

  // Create dropdown
  const dropdown = document.createElement('ul');
  dropdown.id = 'search-history-dropdown';

  // Populate with history items
  history.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'search-history-item';

    // Create text span for the query
    const textSpan = document.createElement('span');
    textSpan.className = 'history-item-text';
    textSpan.textContent = item;
    textSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.getElementById('nl');
      input.value = item;
      dropdown.remove();
      runNLQuery();
    });
    li.appendChild(textSpan);

    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-item-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '删除此记录';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Remove this item from history
      let currentHistory = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY_SEARCH);
        if (stored) currentHistory = JSON.parse(stored);
      } catch (err) {
        console.error('Error reading history:', err);
      }
      currentHistory = currentHistory.filter(h => h !== item);
      localStorage.setItem(STORAGE_KEY_SEARCH, JSON.stringify(currentHistory));

      // Remove the li element
      li.remove();

      // If no more history items, remove the dropdown
      if (currentHistory.length === 0) {
        dropdown.remove();
      }
    });
    li.appendChild(deleteBtn);

    dropdown.appendChild(li);
  });

  // Add "Clear History" button
  const clearBtn = document.createElement('li');
  clearBtn.className = 'search-history-clear';
  clearBtn.textContent = '清除历史记录';
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    localStorage.removeItem(STORAGE_KEY_SEARCH);
    dropdown.remove();
  });
  dropdown.appendChild(clearBtn);

  // Position dropdown below search input
  const searchContainer = document.getElementById('search-container');
  searchContainer.appendChild(dropdown);
}

function hideSearchHistory() {
  const dropdown = document.getElementById('search-history-dropdown');
  if (dropdown) {
    dropdown.remove();
  }
}

// --- Info Panel Functions ---
function minimizeInfoPanel() {
  const infoPanel = document.getElementById('info-panel');
  const infoPanelIcon = document.getElementById('info-panel-icon');

  if (infoPanel && infoPanelIcon) {
    infoPanel.classList.add('hidden');
    infoPanelIcon.classList.remove('hidden');
  }
}

function restoreInfoPanel() {
  const infoPanel = document.getElementById('info-panel');
  const infoPanelIcon = document.getElementById('info-panel-icon');

  if (infoPanel && infoPanelIcon) {
    infoPanel.classList.remove('hidden');
    infoPanelIcon.classList.add('hidden');
  }
}

function collapseAllInfoSections() {
  // Collapse AI details section
  const aiDetailsContent = document.getElementById('ai-details-content');
  const aiDetailsHeader = document.getElementById('toggle-ai-details');
  if (aiDetailsContent && !aiDetailsContent.classList.contains('hidden')) {
    aiDetailsContent.classList.add('hidden');
    if (aiDetailsHeader) aiDetailsHeader.classList.remove('active');
    return true; // Indicates something was collapsed
  }

  // Collapse earthquake list section
  const quakeListContainer = document.getElementById('quake-list-container');
  const quakeListHeader = document.getElementById('toggle-quake-list');
  if (quakeListContainer && !quakeListContainer.classList.contains('hidden')) {
    quakeListContainer.classList.add('hidden');
    if (quakeListHeader) quakeListHeader.classList.remove('active');
    return true; // Indicates something was collapsed
  }

  return false; // Nothing was collapsed
}

function hasExpandedInfoSections() {
  const aiDetailsContent = document.getElementById('ai-details-content');
  const quakeListContainer = document.getElementById('quake-list-container');

  const aiExpanded = aiDetailsContent && !aiDetailsContent.classList.contains('hidden');
  const listExpanded = quakeListContainer && !quakeListContainer.classList.contains('hidden');

  return aiExpanded || listExpanded;
}

// 3. 核心查询函数
async function runNLQuery() {
  const input = document.getElementById("nl");
  const q = input.value.trim();
  if (!q) return;

  // Hide search history dropdown
  hideSearchHistory();

  input.value = "";
  setLoading(true);

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/nl-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });

    if (!resp.ok) throw new Error(await resp.text());
    const payload = await resp.json();

    renderGeoJSON(payload.geojson, payload.plan);
    updateInfoPanel(payload);
    updateQueryContext(q, payload.plan, payload.geojson, payload.stats);

    // Save plan for heatmap toggle
    window.lastPlan = payload.plan;

    // Save successful query to history
    saveSearchHistory(q);

  } catch (e) {
    alert(`查询出错: ${e.message}`);
  } finally {
    setLoading(false);
  }
}

// 4. 定位功能 (这里是你之前缺失的部分)
const locateBtn = document.getElementById("btn-locate");
if (locateBtn) {
  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("浏览器不支持定位");
      return;
    }
    locateBtn.style.color = "#4285F4"; // 视觉反馈

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(2);
        const lon = pos.coords.longitude.toFixed(2);
        const input = document.getElementById("nl");
        input.value = `查询坐标 ${lat}, ${lon} 附近 500km 内的地震`;
        runNLQuery();
        locateBtn.style.color = "#666";
      },
      (err) => {
        alert("定位失败(请检查是否为https/localhost): " + err.message);
        locateBtn.style.color = "red";
      }
    );
  });
}

// 5. 初始化绑定
document.getElementById("run-nl").addEventListener("click", runNLQuery);
document.getElementById("nl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runNLQuery();
});

// Search history event listeners
document.getElementById("nl").addEventListener("focus", showSearchHistory);

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const searchContainer = document.getElementById('search-container');
  if (!searchContainer.contains(e.target)) {
    hideSearchHistory();
  }
});

// Global keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const input = document.getElementById('nl');
  const dropdown = document.getElementById('search-history-dropdown');
  const infoPanel = document.getElementById('info-panel');

  // "/" - Focus search bar and show history
  if (e.key === '/') {
    // Don't trigger if user is typing in an input field
    if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') {
      return;
    }
    e.preventDefault();
    input.focus();
    showSearchHistory();
  }

  // "Esc" - Close things in priority order
  if (e.key === 'Escape') {
    // Priority 1: Close search dropdown if visible
    if (dropdown) {
      hideSearchHistory();
      return;
    }

    // Priority 2: Blur search input if focused
    if (document.activeElement === input) {
      input.blur();
      return;
    }

    // Priority 3: Handle info panel
    if (infoPanel && !infoPanel.classList.contains('hidden')) {
      // Check if any sections are expanded
      if (hasExpandedInfoSections()) {
        // First Esc: Collapse all expanded sections
        collapseAllInfoSections();
      } else {
        // Second Esc (or first if no expanded): Minimize to icon
        minimizeInfoPanel();
      }
      return;
    }
  }
});

// 6. 添加图例
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "info legend");
  div.style.background = "white";
  div.style.padding = "10px";
  div.style.borderRadius = "5px";
  div.style.boxShadow = "0 0 15px rgba(0,0,0,0.2)";
  div.style.fontSize = "12px";
  div.style.lineHeight = "1.5";
  div.innerHTML = `
    <div style="font-weight:bold; margin-bottom:5px">震级 (Magnitude)</div>
    <div><span style="background:#7a0177; width:10px; height:10px; display:inline-block; border-radius:50%; margin-right:5px"></span> ≥ 7 (大灾难)</div>
    <div><span style="background:#dd3497; width:10px; height:10px; display:inline-block; border-radius:50%; margin-right:5px"></span> 5 - 7 (强震)</div>
    <div><span style="background:#fcc5c0; width:10px; height:10px; display:inline-block; border-radius:50%; margin-right:5px"></span> < 5 (轻微)</div>
  `;
  return div;
};
legend.addTo(map);

// --- Custom Heatmap Control ---
const heatControl = L.control({ position: 'topright' });

heatControl.onAdd = function(map) {
  const div = L.DomUtil.create('div', 'leaflet-bar');
  const btn = L.DomUtil.create('button', 'custom-map-control', div);
  btn.innerHTML = '🔥'; // Fire emoji for Heatmap
  btn.title = '切换热力图模式';
  btn.id = 'btn-toggle-heat';

  btn.onclick = function(e) {
    L.DomEvent.stopPropagation(e); // Prevent map click
    toggleHeatmapMode();
  };

  return div;
};

heatControl.addTo(map);

// --- Toggle Logic ---
function toggleHeatmapMode() {
  isHeatmapMode = !isHeatmapMode;

  // Update Button UI
  const btn = document.getElementById('btn-toggle-heat');
  if (isHeatmapMode) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }

  // Re-render map using stored data if available
  if (currentFeatures.length > 0) {
    if (window.lastPlan) {
      renderGeoJSON({ type: "FeatureCollection", features: currentFeatures }, window.lastPlan);
    }
  }
}

// Chat event listeners
const chatSendBtn = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");

if (chatSendBtn) {
  chatSendBtn.addEventListener("click", sendChatMessage);
}

if (chatInput) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// Initialize collapsible sections
setupCollapsibles();

// Initialize chat history from localStorage
initializeChat();

// Clear chat button listener
const chatClearBtn = document.getElementById('chat-clear');
if (chatClearBtn) {
  chatClearBtn.addEventListener('click', clearChatHistory);
}