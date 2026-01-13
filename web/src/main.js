import L from "leaflet";
import "./style.css";

const BACKEND_BASE = "http://127.0.0.1:8000";

const map = L.map("map").setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let currentLayer = null;

function formatTime(ms) {
  if (typeof ms !== "number") return "N/A";
  return new Date(ms).toLocaleString();
}

function colorByMag(mag) {
  if (mag == null || Number.isNaN(mag)) return "#888";
  if (mag >= 7) return "#7a0177";
  if (mag >= 6) return "#ae017e";
  if (mag >= 5) return "#dd3497";
  if (mag >= 4) return "#f768a1";
  if (mag >= 3) return "#fa9fb5";
  return "#fcc5c0";
}

function radiusByMag(mag) {
  if (mag == null || Number.isNaN(mag)) return 4;
  return Math.max(3, mag * 2.2);
}

function renderGeoJSON(geojson) {
  if (currentLayer) {
    map.removeLayer(currentLayer);
    currentLayer = null;
  }

  currentLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const mag = feature?.properties?.mag;
      return L.circleMarker(latlng, {
        radius: radiusByMag(mag),
        color: "#222",
        weight: 1,
        fillColor: colorByMag(mag),
        fillOpacity: 0.8,
      });
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const coords = feature?.geometry?.coordinates;
      const depthKm = Array.isArray(coords) && coords.length >= 3 ? coords[2] : null;

      layer.bindPopup(
        `<b>${p.place ?? "Unknown"}</b><br/>
         Magnitude: <b>${p.mag ?? "N/A"}</b><br/>
         Depth: ${depthKm ?? "N/A"} km<br/>
         Time: ${formatTime(p.time)}<br/>
         ${p.url ? `<a href="${p.url}" target="_blank" rel="noreferrer">USGS details</a>` : ""}`
      );
    },
  }).addTo(map);

  try {
    map.fitBounds(currentLayer.getBounds().pad(0.2));
  } catch {}
}

// --- 辅助格式化函数开始 ---

// 格式化震级
function formatMagRange(plan) {
  if (plan.mag_phrase) return `描述为"${plan.mag_phrase}"`;
  if (plan.minmagnitude && plan.maxmagnitude) return `${plan.minmagnitude} - ${plan.maxmagnitude} 级`;
  if (plan.minmagnitude) return `≥ ${plan.minmagnitude} 级`;
  if (plan.maxmagnitude) return `≤ ${plan.maxmagnitude} 级`;
  return "全部震级";
}

// 格式化位置 (新加的 BBox 支持)
function formatLocation(plan) {
  // 检查是否具备 4 个 BBox 参数
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

// 格式化深度 (新加的 Depth 支持)
function formatDepth(plan) {
  if (plan.mindepth != null && plan.maxdepth != null) return `${plan.mindepth} - ${plan.maxdepth} km`;
  if (plan.mindepth != null) return `> ${plan.mindepth} km`;
  if (plan.maxdepth != null) return `< ${plan.maxdepth} km`;
  return "不限深度";
}
// --- 辅助格式化函数结束 ---


// --- 主 setInfo 函数 ---
function setInfo(payload) {
  const el = document.getElementById("info");
  if (!el) return;

  const plan = payload.plan || {};
  const stats = payload.stats || {};
  const timing = payload.timing_ms || {};

  // 这里用了模板字符串生成 HTML，比纯文本直观得多
  let html = `
    <div style="font-family: sans-serif; font-size: 0.9em; line-height: 1.6; color: #333;">
      <h4 style="margin: 0 0 8px 0; color: #444;">🧠 AI 理解结果</h4>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>时间范围:</strong> 过去 ${plan.window_value} ${plan.window_unit === 'hours' ? '小时' : '天'}</li>
        <li><strong>位置范围:</strong> ${formatLocation(plan)}</li>
        <li><strong>震级筛选:</strong> ${formatMagRange(plan)}</li>
        <li><strong>深度筛选:</strong> ${formatDepth(plan)}</li>
      </ul>
      
      <hr style="border:0; border-top:1px solid #ddd; margin:10px 0;">
      
      <div style="margin-bottom: 5px;">
        <strong>📊 搜索结果:</strong> 
        找到 <b style="color: #d63031;">${stats.count}</b> 次地震 
        ${stats.max_magnitude ? `(最大 <b>${stats.max_magnitude}</b> 级)` : ''}
      </div>
      
      <div style="color: #777; font-size: 0.85em;">
        耗时: LLM ${timing.llm}ms + API ${timing.usgs}ms = <strong>${timing.total}ms</strong>
        ${payload.cache_hit ? '<span style="color:green; margin-left:5px;">(⚡Cache Hit)</span>' : ''}
      </div>
    </div>
  `;

  el.innerHTML = html;
}

async function runNLQuery() {
  const input = document.getElementById("nl");
  if (!input) throw new Error("Missing #nl input in index.html");

  const q = input.value.trim();
  if (!q) return;

  const resp = await fetch(`${BACKEND_BASE}/api/nl-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Backend ${resp.status}: ${text}`);
  }

  const payload = await resp.json();
  if (payload.geojson) renderGeoJSON(payload.geojson);

  setInfo({
    plan: payload.plan,
    stats: payload.stats,
    timing_ms: payload.timing_ms,
    cache_hit: payload.cache_hit,
    request: payload.request,
  });
}

function wireUI() {
  const btn = document.getElementById("run-nl");
  if (!btn) throw new Error("Missing #run-nl button in index.html");

  btn.addEventListener("click", () => {
    runNLQuery().catch((e) => {
      console.error(e);
      alert(e.message);
    });
  });

  // 默认示例
  const input = document.getElementById("nl");
  if (input && !input.value) {
    input.value = "过去3小时的地震";
  }
}

wireUI();