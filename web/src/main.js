// Globals from CDN
const L = window.L;
const Chart = window.Chart;

const BACKEND_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY_SEARCH = 'earthquake_search_history';
const STORAGE_KEY_CHAT = 'earthquake_chat_history';

// --- 1. 定义地图底图 (Base Layers) ---
const darkMatter = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 18,
    attribution: "© CartoDB",
  }
);

// Map that works well without VPN in mainland China
const gaode = L.tileLayer("https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
  maxZoom: 18,
  attribution: "© 高德地图"
});

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 18,
    attribution: "© Esri",
  }
);

// --- 2. 初始化地图 & 图层控件 ---
const map = L.map("map", {
  center: [35, 105], // Centered roughly on China/Asia for better initial Gaode view
  zoom: 3,           // Zoomed in slightly to avoid missing zoom-2 tiles on Gaode
  minZoom: 3,        // Prevent zooming out to see black borders
  maxZoom: 18,
  maxBounds: [
    [-90, -280],     // 扩展东西经边界，留出空间显示边缘数据点
    [90, 280]
  ],
  maxBoundsViscosity: 0.8, // 取消死板的边缘撞击，改为柔和回弹
  worldCopyJump: false,     // Disable infinite horizontal scrolling
  layers: [gaode], // Default to Light Mode (Gaode)
  zoomControl: false,
  attributionControl: false // Minimalist look
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const baseMaps = {
  "Standard Mode (Light)": gaode,
  "Command Mode (Dark)": darkMatter,
  "Satellite View": satellite,
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
// Mag colors updated to match CSS variables for consistency
function colorByMag(mag) {
  if (mag >= 7) return "#ef4444"; // mag-extreme
  if (mag >= 6) return "#f97316"; // mag-high
  if (mag >= 5) return "#eab308"; // mag-medium
  if (mag >= 4) return "#22c55e"; // mag-low
  return "#0ea5e9"; // accent-secondary (very low)
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
    // Intensity calculation: Enhanced formula for much better heatmap visibility
    // Adjust base intensity and scale to make all points clearly visible
    const intensity = Math.max(0.5, (mag + 1) / 8.0);
    // console.log(`Point: [${coords[1]}, ${coords[0]}], Mag: ${mag}, Intensity: ${intensity}`);
    return [coords[1], coords[0], intensity];
  });
}

// Helper: Download a string as a file
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: Convert GeoJSON features to CSV string
function convertToCSV(features) {
  // Define CSV headers
  const headers = ['Time', 'Magnitude', 'Place', 'Depth (km)', 'Latitude', 'Longitude', 'USGS ID', 'URL'];

  // Map features to rows
  const rows = features.map(f => {
    const p = f.properties;
    const c = f.geometry.coordinates;

    // Handle potential nulls and formatting
    const time = new Date(p.time).toISOString();
    const mag = p.mag || 0;
    const place = `"${(p.place || '').replace(/"/g, '""')}"`; // Escape quotes
    const depth = c[2];
    const lat = c[1];
    const lon = c[0];
    const id = f.id;
    const url = p.url;

    return [time, mag, place, depth, lat, lon, id, url].join(',');
  });

  // Combine header and rows
  return [headers.join(',')].concat(rows).join('\n');
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
    stats: stats, // BUG FIX: correctly capture full stats for backend optimized list
    features: featureSummaries
  };

  console.log('Query context updated:', lastQueryContext);
}

// Build a context-aware message for the AI
// Only inject context for the FIRST message after a new query to avoid token waste
function buildContextAwareMessage(userMessage) {
  // Check if we have context and if it hasn't been sent yet
  if (!lastQueryContext || lastQueryContext.totalCount === 0 || lastQueryContext.contextSent) {
    return {
      hasContext: false,
      content: userMessage
    };
  }

  // Mark context as sent so we don't repeat it
  lastQueryContext.contextSent = true;

  // Use backend pre-computed stats if available (New Strategy: Data Summarization)
  const stats = lastQueryContext.stats || {};
  let contextContent = "";

  if (stats.top_20 && stats.dist_mag) {
    // 1. Distribution
    const dist = stats.dist_mag;
    const distStr = `3-4级:${dist["3.0-4.0"]}次, 4-5级:${dist["4.0-5.0"]}次, 5-6级:${dist["5.0-6.0"]}次, 6-7级:${dist["6.0-7.0"]}次, 7级以上:${dist["7.0+"]}次`;

    // 2. Top 20 List
    const top20Str = stats.top_20.map((f, index) =>
      `${index + 1}. ${f.place} | 震级:${f.mag} | 深度:${f.depth}km | 时间:${f.time_str}`
    ).join('\n');

    contextContent = `【当前地图上的地震数据背景】
用户查询：${lastQueryContext.userQuery}
查询时间：${lastQueryContext.timestamp}
数据统计：共 ${stats.count} 次地震
- 最大震级：${stats.max_magnitude}
- 平均震级：${stats.avg_magnitude ? stats.avg_magnitude.toFixed(2) : 'N/A'}
- 震级分布：${distStr}

【Top 20 最强地震列表】（Backend Optimized）：
${top20Str}

（注：系统已进行数据预压缩，仅提供统计和 Top 20 供分析）`;
  } else {
    // Fallback if backend stats missing (Legacy behavior)
    const MAX_FEATURES_FOR_CHAT = 20;
    const limitedFeatures = lastQueryContext.features.slice(0, MAX_FEATURES_FOR_CHAT);
    const featureList = limitedFeatures.map(f =>
      `${f.rank}. ${f.place} | 震级:${f.mag} | 深度:${f.depth}km | 时间:${f.time}`
    ).join('\n');

    contextContent = `【当前地图上的地震数据背景】
用户查询：${lastQueryContext.userQuery}
查询时间：${lastQueryContext.timestamp}
统计：共 ${lastQueryContext.totalCount} 次，最大 ${lastQueryContext.maxMagnitude}
列表：
${featureList}`;
  }

  const finalMessage = `${contextContent}\n\n---\n【用户当前问题】：${userMessage}`;

  return {
    hasContext: true,
    content: finalMessage
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

  // Magnitude chart colors matching map markers
  const magColors = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444'];

  // Depth chart colors: Using a distinct Purple/Pink palette (light to dark)
  // to avoid confusion with magnitude colors and show clear depth progression
  const depthColors = ['#e879f9', '#c026d3', '#701a75'];

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
    maintainAspectRatio: false, // Critical for flex containers
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
function addChatBubble(role, text, thinkingTime = null) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user" : "ai"}`;
  bubble.style.userSelect = "text";  // Make content selectable/copyable
  bubble.style.cursor = "text";

  // Main text content
  const textSpan = document.createElement("span");
  textSpan.className = "markdown-body";

  // Use marked.js if available, otherwise fallback to plain text
  if (window.marked) {
    const rawHtml = window.marked.parse(text);
    textSpan.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
  } else {
    textSpan.textContent = text;
  }
  bubble.appendChild(textSpan);

  // Add highlight matching
  if (window.hljs) {
    textSpan.querySelectorAll('pre code').forEach((block) => {
      window.hljs.highlightElement(block);
    });
  }

  if (role === "ai") {
    // Add thinking time for AI responses
    if (thinkingTime !== null) {
      const timeSpan = document.createElement("span");
      timeSpan.className = "thinking-time";
      timeSpan.textContent = `生成时间 ${thinkingTime.toFixed(1)}s`;
      timeSpan.style.fontSize = "0.7em";
      timeSpan.style.opacity = "0.3";
      timeSpan.style.marginLeft = "8px";
      bubble.appendChild(timeSpan);
    }

    // Add copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "chat-copy-btn";
    copyBtn.title = "复制内容";
    copyBtn.innerHTML = "📋";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = "✓";
        setTimeout(() => copyBtn.innerHTML = orig, 2000);
      });
    };
    bubble.appendChild(copyBtn);
  }

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
  input.style.height = "auto"; // Reset textarea height

  // Build context-aware message
  const contextResult = buildContextAwareMessage(text);

  // Add to history (use the context-enhanced content for AI, but store original for display)
  chatHistory.push({ role: "user", content: contextResult.content, displayContent: text });
  saveChatHistory();

  // Create thinking/streaming bubble
  const container = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble ai";
  bubble.style.userSelect = "text";
  bubble.style.cursor = "text";

  const textSpan = document.createElement("span");
  textSpan.className = "markdown-body";
  textSpan.innerHTML = "<em class='loading-text'>思考中...</em>"; // Initial pulsing state
  bubble.appendChild(textSpan);

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;

  let fullReply = "";
  const startTime = performance.now();

  try {
    // Dynamic history truncation based on total character count (approx token limit)
    const MAX_CHAR_LIMIT = 30000; // Increased to handle roughly 10-15 rounds of rich context
    let trimmedHistory = [];
    let currentCharCount = 0;

    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msgLength = chatHistory[i].content ? chatHistory[i].content.length : 0;
      if (currentCharCount + msgLength > MAX_CHAR_LIMIT && trimmedHistory.length > 0) {
        break;
      }
      trimmedHistory.unshift(chatHistory[i]);
      currentCharCount += msgLength;
    }

    if (trimmedHistory.length < chatHistory.length) {
      // Prevent duplicate notices appearing back-to-back
      const lastElement = container.children[container.children.length - 2];
      if (!lastElement || lastElement.className !== "chat-system-notice") {
        const warningDiv = document.createElement("div");
        warningDiv.className = "chat-system-notice";
        warningDiv.innerHTML = "⚠️ 早期上下文因过长已折叠，建议点击左上角 🗑️ 开启新话题";
        container.insertBefore(warningDiv, bubble);
      }
    }

    const resp = await fetch(`${BACKEND_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream" // Ask for stream
      },
      body: JSON.stringify({ messages: trimmedHistory }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    // Stream Reader Setup
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let isFirstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataText = line.substring(6);
          if (dataText === '[DONE]') continue;

          try {
            const data = JSON.parse(dataText);
            const contentChunk = data.choices[0]?.delta?.content || "";

            if (contentChunk) {
              if (isFirstChunk) {
                textSpan.innerHTML = ""; // Clear "思考中..."
                isFirstChunk = false;
              }
              fullReply += contentChunk;

              // Incrementally render markdown
              if (window.marked) {
                const rawHtml = window.marked.parse(fullReply);
                textSpan.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
              } else {
                textSpan.textContent = fullReply;
              }

              // Keep scrolled to bottom
              container.scrollTop = container.scrollHeight;
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e, line);
          }
        }
      }
    }

    // Highlight code blocks when stream completes
    if (window.hljs) {
      textSpan.querySelectorAll('pre code').forEach((block) => {
        window.hljs.highlightElement(block);
      });
    }

    const thinkingTime = (performance.now() - startTime) / 1000;

    // Add thinking time indicator at the end
    const timeSpan = document.createElement("span");
    timeSpan.className = "thinking-time";
    timeSpan.textContent = `生成时间 ${thinkingTime.toFixed(1)}s`;
    timeSpan.style.fontSize = "0.7em";
    timeSpan.style.opacity = "0.3";
    timeSpan.style.marginLeft = "8px";
    bubble.appendChild(timeSpan);

    // Add copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "chat-copy-btn";
    copyBtn.title = "复制内容";
    copyBtn.innerHTML = "📋";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(fullReply).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = "✓";
        setTimeout(() => copyBtn.innerHTML = orig, 2000);
      });
    };
    bubble.appendChild(copyBtn);

    // Save final response to history
    chatHistory.push({ role: "assistant", content: fullReply });
    saveChatHistory();

  } catch (e) {
    if (fullReply === "") {
      textSpan.innerHTML = "抱歉，出现了网络错误，请稍后再试。";
    } else {
      textSpan.innerHTML += "<br><br><em>(连接中断)</em>";
    }
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
    // Show default welcome message (ensure it renders via marked if available)
    addChatBubble('ai', '系统就绪。\n随时待命分析全球地震数据与地质态势。');
  }
}

// --- 渲染逻辑 ---
function renderGeoJSON(geojson, plan, preserveView = false) {
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
    // console.log("Rendering Heatmap Mode");
    const points = getHeatmapPoints(features);
    // console.log(`Heatmap Points: ${points.length}`);
    if (points.length > 0) {
      try {
        heatLayer = L.heatLayer(points, {
          radius: 50, // Significantly increased radius for better visibility
          blur: 30, // Increased blur for smoother heat spreading
          maxZoom: 14,
          max: 1.0,
          gradient: {
            0.2: '#0ea5e9', // Light Blue
            0.4: '#10b981', // Emerald
            0.6: '#fbbf24', // Amber
            0.8: '#f97316', // Orange
            1.0: '#ef4444'  // Red
          }
        }).addTo(map);
        // console.log("HeatLayer added to map", heatLayer);
      } catch (err) {
        console.error("Error creating heatLayer:", err);
      }
    }
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
          `<div class="popup-header">
             <span class="popup-mag-badge" style="background-color:${colorByMag(p.mag)}">${formatMag(p.mag)}</span>
             ${p.place || 'Unknown Location'}
           </div>
           <div class="popup-row">
             <span class="popup-label">Depth</span>
             <span class="popup-value">${formatDepthValue(depth)} km</span>
           </div>
           <div class="popup-row">
             <span class="popup-label">Time</span>
             <span class="popup-value">${formatTime(p.time)}</span>
           </div>
           <a href="${p.url}" target="_blank" class="popup-link">View USGS Report →</a>`
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
    // Determine which params to use: prefer actual USGS applied parameters to sync visuals with the backend action
    const displayParams = window.lastPayload && window.lastPayload.usgs_params
      ? window.lastPayload.usgs_params : plan;

    const minlat = displayParams.minlatitude !== undefined ? displayParams.minlatitude : plan.minlatitude;
    const maxlat = displayParams.maxlatitude !== undefined ? displayParams.maxlatitude : plan.maxlatitude;
    const minlon = displayParams.minlongitude !== undefined ? displayParams.minlongitude : plan.minlongitude;
    const maxlon = displayParams.maxlongitude !== undefined ? displayParams.maxlongitude : plan.maxlongitude;

    const bounds = [
      [minlat, minlon],
      [maxlat, maxlon],
    ];
    bboxLayer = L.rectangle(bounds, {
      color: "#ff3333",
      weight: 2,
      dashArray: "5, 10",
      fill: false,
    }).addTo(map);
    if (!preserveView) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  } else {
    // Fit bounds to features (works for both layers)
    if (!preserveView) {
      try {
        const layer = isHeatmapMode ? heatLayer : earthquakeLayer;
        if (layer && features.length > 0) {
          // HeatLayer doesn't have getBounds, need to calculate manually or skip
          if (!isHeatmapMode) map.fitBounds(layer.getBounds().pad(0.1));
        }
      } catch (e) { }
    }
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
  // Delay slightly to ensure DOM is ready and layout is stable
  setTimeout(() => {
    renderCharts(features);
  }, 100);

  // Update AI Filter Criteria
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
  const aiDetailsContent = document.getElementById('ai-details-content');

  // Make sure to remove hidden class if it was hidden
  if (aiDetailsList) aiDetailsList.classList.remove('hidden');
  if (aiDetailsContent) aiDetailsContent.classList.remove('hidden');

  aiDetailsList.innerHTML = `
    <li><strong>时间范围:</strong> ${timeStr}</li>
    <li><strong>地理区域:</strong> ${formatLocation(plan)}</li>
    <li><strong>震级筛选:</strong> ${formatMagRange(plan)}</li>
    <li><strong>深度筛选:</strong> ${formatDepth(plan)}</li>
  `;

  // Update header text to "Filter Criteria"
  const aiHeader = document.getElementById('toggle-ai-details');
  if (aiHeader) {
    aiHeader.innerHTML = '筛选条件 (FILTER CRITERIA)';
    aiHeader.classList.remove('active'); // Reset active state if needed, or keep it depending on desired behavior. Default expanded usually means no special active class unless it denotes "collapsed".
    // Actually, if we just un-hid the content, we should ensure the header state matches "expanded".
    // However, the current logic seems to use 'active' for something else or not strictly.
    // Let's just ensure content is visible.
  }

  // Update timing info
  const timingInfo = document.getElementById('timing-info');
  timingInfo.innerHTML = `
    ⏱️ 耗时: LLM ${timing.llm}ms + API ${timing.usgs}ms = ${timing.total}ms
    ${payload.cache_hit ? '<span style="color:green;"> (缓存命中)</span>' : ''}
  `;

  // Update earthquake list
  // ENSURE CONTAINER IS VISIBLE
  const quakeListContainer = document.getElementById('quake-list-container');
  if (quakeListContainer) quakeListContainer.classList.remove('hidden');

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
  // Remove expanded class initially (reset state)
  list.classList.remove('quake-list-expanded');

  if (!list) return;

  list.innerHTML = "";

  if (features.length === 0) {
    list.innerHTML = '<li style="color:#666;padding:20px;text-align:center;">暂无地震数据</li>';
    return;
  }

  // Logic: Show top 5 by default
  const MAX_VISIBLE = 5;
  const showAll = features.length <= MAX_VISIBLE; // Or check a flag passed if needed, but default is folded

  const visibleFeatures = features.slice(0, MAX_VISIBLE);

  // Render visible items
  visibleFeatures.forEach(f => {
    list.appendChild(createQuakeItem(f));
  });

  // If more items exist, add "Show More" button
  if (features.length > MAX_VISIBLE) {
    const remainingCount = features.length - MAX_VISIBLE;
    const btn = document.createElement('button');
    btn.id = 'btn-show-more';
    btn.textContent = `显示更多 (${remainingCount} 条)`;

    btn.addEventListener('click', () => {
      // Remove button
      btn.remove();
      // Render remaining items
      const remainingFeatures = features.slice(MAX_VISIBLE);
      remainingFeatures.forEach(f => {
        list.appendChild(createQuakeItem(f));
      });
      // Mark as expanded for Esc key logic
      list.classList.add('quake-list-expanded');

      // Scroll new items into view smoothly if needed (optional)
    });

    list.appendChild(btn);
  }
}

// Helper: Create single quake item element
function createQuakeItem(f) {
  const p = f.properties;
  const coords = f.geometry.coordinates;
  const depth = coords[2];
  const timeObj = new Date(p.time);
  const dateStr = timeObj.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  const timeStr = timeObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const li = document.createElement("li");
  li.className = "quake-item";

  const magColor = colorByMag(p.mag);

  li.innerHTML = `
    <div class="quake-mag-badge" style="background-color:${magColor}">${formatMag(p.mag)}</div>
    <div class="quake-details">
      <span class="quake-place" title="${p.place}">${p.place || 'Unknown Location'}</span>
      <div class="quake-time-depth">
        <span>${dateStr} ${timeStr}</span>
        <span>${formatDepthValue(depth)} km</span>
      </div>
    </div>
  `;

  // Click to fly to location
  li.addEventListener('click', () => {
    map.flyTo([coords[1], coords[0]], 8, { duration: 1.5 });
    // Open popup if layer exists
    if (earthquakeLayer) {
      earthquakeLayer.eachLayer(layer => {
        if (layer.feature.id === f.id) {
          layer.openPopup();
        }
      });
    }
  });

  return li;
}



// --- 事件绑定 ---

// 1. 最小化面板按钮
document.getElementById("close-info").addEventListener("click", () => {
  minimizeInfoPanel();
});

// Helper to restore info panel
function restoreInfoPanel() {
  const panel = document.getElementById('info-panel');
  const icon = document.getElementById('info-panel-icon');
  if (panel) panel.classList.remove('hidden');
  if (icon) icon.classList.add('hidden');
}

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

    // Save successful query to history first (before rendering which might fail)
    saveSearchHistory(q);

    renderGeoJSON(payload.geojson, payload.plan);
    updateInfoPanel(payload);
    updateQueryContext(q, payload.plan, payload.geojson, payload.stats);

    // Save plan for heatmap toggle
    window.lastPlan = payload.plan;

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
      // 1. If list is fully expanded (via "Show More"), collapse it back to 5 items.
      if (document.querySelector('.quake-list-expanded')) {
        // Collapse the list back to 5 items
        const features = currentFeatures || [];
        renderList(features); // This resets to default 5 items
        return;
      }

      // 2. Otherwise, minimize the entire panel directly.
      // We no longer hide individual sections (like AI details or list container) 
      // because user wants them to stay visible until the whole thing minimizes.
      minimizeInfoPanel();
      return;
    }
  }
});



// Legend removed per user request

// --- Custom Heatmap Control ---
// --- Mission Control Logic ---

// 1. Layer Toggle (Gaode/Satellite/Dark)
const btnLayerToggle = document.getElementById('btn-layer-toggle');
// Map order: 0 = Light (Gaode), 1 = Satellite, 2 = Dark
const mapModes = [gaode, satellite, darkMatter];
let currentMapModeIndex = 0; // Starts at 0 because map is initialized with gaode

if (btnLayerToggle) {
  btnLayerToggle.addEventListener('click', () => {
    // 1. Remove current layer
    map.removeLayer(mapModes[currentMapModeIndex]);

    // 2. Increment cycle
    currentMapModeIndex = (currentMapModeIndex + 1) % mapModes.length;

    // 3. Add new layer
    map.addLayer(mapModes[currentMapModeIndex]);

    // 4. Update Button UI state
    if (currentMapModeIndex === 0) {
      btnLayerToggle.classList.remove('active');
    } else {
      btnLayerToggle.classList.add('active'); // active for non-default modes
    }
  });
}

// 2. Heatmap Toggle
const btnHeatToggle = document.getElementById('btn-toggle-heat');
if (btnHeatToggle) {
  btnHeatToggle.addEventListener('click', toggleHeatmapMode);
}

// 3. Zoom Controls
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
if (btnZoomIn) btnZoomIn.addEventListener('click', () => map.zoomIn());
if (btnZoomOut) btnZoomOut.addEventListener('click', () => map.zoomOut());

// --- Toggle Logic for Heatmap ---
function toggleHeatmapMode() {
  isHeatmapMode = !isHeatmapMode;

  // Update Button UI
  const btn = document.getElementById('btn-toggle-heat');
  if (btn) {
    if (isHeatmapMode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // Re-render map using stored data if available
  if (currentFeatures.length > 0) {
    if (window.lastPlan) {
      renderGeoJSON({ type: "FeatureCollection", features: currentFeatures }, window.lastPlan, true);
    }
  }
}

// Chat Toggle Logic
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatSidebar = document.getElementById("chat-sidebar");

if (chatToggleBtn && chatSidebar) {
  chatToggleBtn.addEventListener("click", () => {
    chatSidebar.classList.toggle("hidden");
    // Focus input if opening
    if (!chatSidebar.classList.contains("hidden")) {
      setTimeout(() => document.getElementById("chat-input").focus(), 100);
    }
  });

  // Handle ESC key to close sidebar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !chatSidebar.classList.contains("hidden")) {
      chatSidebar.classList.add("hidden");
    }
  });
}

// Chat event listeners
const chatSendBtn = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");

if (chatSendBtn) {
  chatSendBtn.addEventListener("click", sendChatMessage);
}

if (chatInput) {
  // Handle auto-resizing
  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  // Handle enter key (shift+enter for newline)
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

// Quick Prompts Setup
const promptChips = document.querySelectorAll('.prompt-chip');
if (promptChips.length > 0) {
  promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const queryText = chip.getAttribute('data-query');
      if (chatInput && queryText) {
        chatInput.value = queryText;
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        sendChatMessage();
      }
    });
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

// --- Export Logic ---
// --- Export Logic ---
const exportBtn = document.getElementById('btn-export-trigger');
const exportMenu = document.getElementById('export-menu');
const exportOptions = document.querySelectorAll('.export-option');

// Toggle menu
if (exportBtn && exportMenu) {
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from closing it immediately

    // Check if we have data to export (optional, maybe user wants to see options first)
    // if (!currentFeatures || currentFeatures.length === 0) { ... }

    // Toggle the class
    if (exportMenu.classList.contains('hidden')) {
      exportMenu.classList.remove('hidden');
    } else {
      exportMenu.classList.add('hidden');
    }
  });
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (exportMenu && !exportMenu.classList.contains('hidden')) {
    // Only close if click is NOT inside the menu
    if (!exportMenu.contains(e.target) && e.target !== exportBtn && !exportBtn.contains(e.target)) {
      exportMenu.classList.add('hidden');
    }
  }
});

// Handle export options
exportOptions.forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing menu immediately (though we close it manually below)
    const type = opt.dataset.type;
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `earthquakes_${timestamp}.${type}`;

    if (!currentFeatures || currentFeatures.length === 0) {
      alert('暂无数据可导出');
      return;
    }

    if (type === 'csv') {
      const csvContent = convertToCSV(currentFeatures);
      downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');
    } else if (type === 'geojson') {
      const geojsonObj = {
        type: "FeatureCollection",
        metadata: { generated: new Date().getTime(), title: "Exported from Earthquake Agent" },
        features: currentFeatures
      };
      const jsonContent = JSON.stringify(geojsonObj, null, 2);
      downloadFile(jsonContent, fileName, 'application/geo+json');
    }

    // Close menu
    exportMenu.classList.add('hidden');
  });
});

// --- Secondary Filter Logic ---
const filterToggleBtn = document.getElementById('btn-filter-toggle');
const filterPanel = document.getElementById('filter-panel');
const filterCloseBtn = document.getElementById('filter-close');
const filterResetBtn = document.getElementById('filter-reset');

const filterMagSlider = document.getElementById('filter-mag-slider');
const filterDepthSlider = document.getElementById('filter-depth-slider');

const magMinVal = document.getElementById('mag-min-val');
const magMaxVal = document.getElementById('mag-max-val');
const depthMinVal = document.getElementById('depth-min-val');
const depthMaxVal = document.getElementById('depth-max-val');
const filterStats = document.getElementById('filter-stats');

// Initialize noUiSliders
if (filterMagSlider && window.noUiSlider) {
  window.noUiSlider.create(filterMagSlider, {
    start: [0, 10],
    connect: true,
    step: 0.1,
    range: {
      'min': 0,
      'max': 10
    }
  });
}

if (filterDepthSlider && window.noUiSlider) {
  window.noUiSlider.create(filterDepthSlider, {
    start: [0, 700],
    connect: true,
    step: 1,
    range: {
      'min': 0,
      'max': 700
    }
  });
}

// Toggle filter panel
if (filterToggleBtn && filterPanel) {
  filterToggleBtn.addEventListener('click', () => {
    filterPanel.classList.toggle('hidden');
    if (!filterPanel.classList.contains('hidden')) {
      filterToggleBtn.classList.add('active');
    } else {
      filterToggleBtn.classList.remove('active');
    }
  });
}

// Close filter panel
if (filterCloseBtn) {
  filterCloseBtn.addEventListener('click', () => {
    filterPanel.classList.add('hidden');
    filterToggleBtn.classList.remove('active');
  });
}

// Apply filter function
function applyFilter() {
  if (!currentFeatures || currentFeatures.length === 0) {
    if (filterStats) filterStats.textContent = '暂无查询数据';
    return;
  }

  // Get values from noUiSliders
  let magLow = 0, magHigh = 10;
  let depthLow = 0, depthHigh = 700;

  if (filterMagSlider && filterMagSlider.noUiSlider) {
    const magValues = filterMagSlider.noUiSlider.get();
    magLow = parseFloat(magValues[0]);
    magHigh = parseFloat(magValues[1]);
  }

  if (filterDepthSlider && filterDepthSlider.noUiSlider) {
    const depthValues = filterDepthSlider.noUiSlider.get();
    depthLow = parseFloat(depthValues[0]);
    depthHigh = parseFloat(depthValues[1]);
  }

  // Update display labels
  if (magMinVal) magMinVal.textContent = magLow.toFixed(1);
  if (magMaxVal) magMaxVal.textContent = magHigh.toFixed(1);
  if (depthMinVal) depthMinVal.textContent = Math.round(depthLow);
  if (depthMaxVal) depthMaxVal.textContent = Math.round(depthHigh);

  // Filter features
  const filtered = currentFeatures.filter(f => {
    const mag = f.properties?.mag ?? 0;
    const depth = f.geometry?.coordinates?.[2] ?? 0;
    return mag >= magLow && mag <= magHigh && depth >= depthLow && depth <= depthHigh;
  });

  // Update stats display
  if (filterStats) {
    filterStats.textContent = `当前显示：${filtered.length} / ${currentFeatures.length} 条`;
  }

  // Re-render map & list with filtered data
  const filteredGeoJSON = { type: "FeatureCollection", features: filtered };
  if (window.lastPlan) {
    renderGeoJSON(filteredGeoJSON, window.lastPlan, true);
  }
  renderList(filtered);
  renderCharts(filtered);
}

// Attach event listeners to noUiSliders
if (filterMagSlider && filterMagSlider.noUiSlider) {
  filterMagSlider.noUiSlider.on('update', applyFilter);
}
if (filterDepthSlider && filterDepthSlider.noUiSlider) {
  filterDepthSlider.noUiSlider.on('update', applyFilter);
}

// Reset filter
if (filterResetBtn) {
  filterResetBtn.addEventListener('click', () => {
    if (filterMagSlider && filterMagSlider.noUiSlider) {
      filterMagSlider.noUiSlider.set([0, 10]);
    }
    if (filterDepthSlider && filterDepthSlider.noUiSlider) {
      filterDepthSlider.noUiSlider.set([0, 700]);
    }
    // Set implicitly calls update event, which calls applyFilter
  });
}