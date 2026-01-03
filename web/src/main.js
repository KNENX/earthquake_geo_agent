import L from "leaflet";
import "./style.css";

const BACKEND_BASE = "http://127.0.0.1:8000";

const map = L.map("map").setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

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

async function loadData() {
  const resp = await fetch(`${BACKEND_BASE}/api/usgs-test`);
  if (!resp.ok) throw new Error(`Backend ${resp.status}`);
  const payload = await resp.json();

  const geojson = payload.geojson;
  const layer = L.geoJSON(geojson, {
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
    map.fitBounds(layer.getBounds().pad(0.2));
  } catch {}
}

loadData().catch((e) => {
  console.error(e);
  alert(`Load failed: ${e.message}`);
});