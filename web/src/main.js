import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const BACKEND_BASE = "http://127.0.0.1:3333";

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
          label: function(context) {
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
  chatHistory.push({ role: "user", content: contextResult.content });

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

// --- 渲染逻辑 ---
function renderGeoJSON(geojson, plan) {
  if (earthquakeLayer) {
    map.removeLayer(earthquakeLayer);
    earthquakeLayer = null;
  }
  if (bboxLayer) {
    map.removeLayer(bboxLayer);
    bboxLayer = null;
  }

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
    try {
      if (earthquakeLayer.getLayers().length > 0) {
        map.fitBounds(earthquakeLayer.getBounds().pad(0.1));
      }
    } catch (e) { }
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
  panel.classList.remove("hidden");

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

// 1. 关闭面板
document.getElementById("close-info").addEventListener("click", () => {
  document.getElementById("info-panel").classList.add("hidden");
});

// 3. 核心查询函数
async function runNLQuery() {
  const input = document.getElementById("nl");
  const q = input.value.trim();
  if (!q) return;

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