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
let currentFeatures = []; // 存储当前地震数据

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
         震级: <b>${p.mag}</b><br/>
         深度: ${depth} km<br/>
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

function updateInfoPanel(payload) {
  const panel = document.getElementById("info-panel");
  const content = document.getElementById("info-content");
  panel.classList.remove("hidden");

  const plan = payload.plan;
  const stats = payload.stats;
  const timing = payload.timing_ms;

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

  content.innerHTML = `
    <h4 class="info-title">🧠 AI 理解结果</h4>
    <ul class="info-list">
      <li><strong>时间:</strong> ${timeStr}</li>
      <li><strong>区域:</strong> ${formatLocation(plan)}</li>
      <li><strong>震级:</strong> ${formatMagRange(plan)}</li>
      <li><strong>深度:</strong> ${formatDepth(plan)}</li>
    </ul>
    
    <hr class="info-hr">
    
    <div class="info-stats">
      <strong>📊 搜索结果:</strong> 
      找到 <b style="color: #d63031;">${stats.count}</b> 次地震 
      ${stats.max_magnitude ? `(最大 <b>${stats.max_magnitude}</b> 级)` : ''}
    </div>
    
    <div class="info-footer">
      耗时: LLM ${timing.llm}ms + API ${timing.usgs}ms = <strong>${timing.total}ms</strong>
      ${payload.cache_hit ? '<span style="color:green; margin-left:5px;">(⚡Cache Hit)</span>' : ''}
    </div>
  `;

  currentFeatures = payload.geojson.features || [];

  const listContainer = document.getElementById("quake-list-container");
  const toggleBtn = document.getElementById("toggle-list");

  if (listContainer && toggleBtn) {
    listContainer.classList.add("hidden");
    toggleBtn.textContent = "展开详细列表 ▼";
    toggleBtn.style.display = currentFeatures.length > 0 ? "block" : "none";
    renderList(currentFeatures.slice(0, 50));
  }
}

// --- 列表渲染 ---
function renderList(features) {
  const list = document.getElementById("quake-list");
  if (!list) return;
  list.innerHTML = "";

  features.forEach(f => {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    const li = document.createElement("li");
    li.className = "quake-item";
    li.innerHTML = `
      <span class="quake-mag">${p.mag}</span>
      <span class="quake-place" title="${p.place}">${p.place}</span>
      <span class="quake-time">${new Date(p.time).toLocaleDateString()}</span>
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

// 2. 列表展开/收起
const toggleBtn = document.getElementById("toggle-list");
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    const container = document.getElementById("quake-list-container");
    if (container.classList.contains("hidden")) {
      container.classList.remove("hidden");
      toggleBtn.textContent = "收起列表 ▲";
    } else {
      container.classList.add("hidden");
      toggleBtn.textContent = "展开详细列表 ▼";
    }
  });
}

// --- 聊天功能 ---
function addChatMessage(role, content, isMapResult = false) {
  const messages = document.getElementById("chat-messages");
  const bubble = document.createElement("div");

  if (isMapResult) {
    bubble.className = "chat-bubble chat-map-result";
  } else if (role === "user") {
    bubble.className = "chat-bubble chat-user";
  } else {
    bubble.className = "chat-bubble chat-ai";
  }

  // Convert markdown-style formatting and line breaks
  const formattedContent = content
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

  bubble.innerHTML = `<div class="bubble-content">${formattedContent}</div>`;
  messages.appendChild(bubble);

  // Scroll to bottom
  messages.scrollTop = messages.scrollHeight;
}

function showChatLoading() {
  const messages = document.getElementById("chat-messages");
  const loader = document.createElement("div");
  loader.id = "chat-loader";
  loader.className = "chat-bubble chat-ai";
  loader.innerHTML = `
    <div class="chat-loading">
      <span></span><span></span><span></span>
    </div>
  `;
  messages.appendChild(loader);
  messages.scrollTop = messages.scrollHeight;
}

function hideChatLoading() {
  const loader = document.getElementById("chat-loader");
  if (loader) loader.remove();
}

function ensureChatOpen() {
  const container = document.getElementById("chat-container");
  const body = document.getElementById("chat-body");
  const toggle = document.getElementById("chat-toggle");

  container.classList.remove("chat-minimized");
  body.classList.remove("hidden");
  toggle.textContent = "▼";
}

// 3. 核心查询函数 (升级为双模式)
async function runNLQuery() {
  const input = document.getElementById("nl");
  const q = input.value.trim();
  if (!q) return;

  // 确保聊天窗口打开
  ensureChatOpen();

  // 添加用户消息到聊天
  addChatMessage("user", q);

  // 清空输入框
  input.value = "";

  setLoading(true);
  showChatLoading();

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/nl-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });

    if (!resp.ok) throw new Error(await resp.text());
    const payload = await resp.json();

    hideChatLoading();

    // 根据响应类型分流处理
    if (payload.type === "chat") {
      // CHAT 模式：显示 AI 文本回复
      addChatMessage("ai", payload.message);

    } else if (payload.type === "map") {
      // MAP 模式：更新地图并显示结果卡片
      renderGeoJSON(payload.geojson, payload.plan);
      updateInfoPanel(payload);

      // 在聊天窗口显示地图结果摘要
      const stats = payload.stats;
      const count = stats.count || 0;
      const maxMag = stats.max_magnitude ? `最大 ${stats.max_magnitude} 级` : "";

      let locationInfo = "";
      if (payload.plan.minlatitude != null) {
        locationInfo = "指定区域";
      } else {
        locationInfo = "全球范围";
      }

      const resultText = `<strong>🗺️ 地图已更新</strong>
找到 <strong>${count}</strong> 次地震
${maxMag ? `${maxMag}` : ""}
区域: ${locationInfo}
<em>点击左下角面板查看详情</em>`;

      addChatMessage("ai", resultText, true);
    } else {
      // 兼容旧响应格式 (无 type 字段)
      if (payload.geojson) {
        renderGeoJSON(payload.geojson, payload.plan);
        updateInfoPanel(payload);
        addChatMessage("ai", `🗺️ 已在地图上显示 ${payload.stats?.count || 0} 次地震`, true);
      }
    }

  } catch (e) {
    hideChatLoading();
    addChatMessage("error", `❌ 查询出错: ${e.message}`);
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

// 7. 聊天窗口展开/收起
const chatHeader = document.getElementById("chat-header");
const chatToggle = document.getElementById("chat-toggle");
const chatContainer = document.getElementById("chat-container");
const chatBody = document.getElementById("chat-body");

function toggleChat() {
  const isMinimized = chatContainer.classList.contains("chat-minimized");

  if (isMinimized) {
    chatContainer.classList.remove("chat-minimized");
    chatBody.classList.remove("hidden");
    chatToggle.textContent = "▼";
  } else {
    chatContainer.classList.add("chat-minimized");
    chatBody.classList.add("hidden");
    chatToggle.textContent = "▲";
  }
}

if (chatHeader) {
  chatHeader.addEventListener("click", toggleChat);
}

// 自动展开聊天窗口 (首次加载)
setTimeout(() => {
  toggleChat();
}, 500);