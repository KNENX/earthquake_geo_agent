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

function setInfo(obj) {
  document.getElementById("info").textContent = JSON.stringify(obj, null, 2);
}

async function runNLQuery() {
  const q = document.getElementById("nl").value.trim();
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
  renderGeoJSON(payload.geojson);
  setInfo({ plan: payload.plan, stats: payload.stats, request: payload.request });
}

document.getElementById("run-nl").addEventListener("click", () => {
  runNLQuery().catch((e) => {
    console.error(e);
    alert(e.message);
  });
});

document.getElementById("nl").value = "过去7天震级大于5的地震";

document.getElementById("run").addEventListener("click", () => {
  runQuery().catch((e) => {
    console.error(e);
    alert(e.message);
  });
});

// 默认日期：最近 7 天
(function setDefaultDates() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  const toISO = (d) => d.toISOString().slice(0, 10);
  document.getElementById("end").value = toISO(end);
  document.getElementById("start").value = toISO(start);
})();

// 启动时跑一次
runQuery().catch(console.error);