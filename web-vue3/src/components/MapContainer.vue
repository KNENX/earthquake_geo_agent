<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-heat'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const mapEl = ref(null)
let map = null
let layerGroup = null
let heatLayer = null

// 底图类型
const currentBaseLayer = ref('gaode')
const isHeatmapMode = ref(false)

// 底图配置
const baseLayers = {
  gaode: {
    name: '高德地图',
    url: 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    options: { maxZoom: 18, attribution: '© 高德地图' }
  },
  satellite: {
    name: '卫星影像',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 18, attribution: '© Esri' }
  },
  dark: {
    name: '深色模式',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 18, attribution: '© CartoDB' }
  }
}

let currentTileLayer = null

/**
 * 根据震级获取颜色
 */
function getColorByMag(mag) {
  if (mag >= 7) return '#ef4444'
  if (mag >= 6) return '#f97316'
  if (mag >= 5) return '#eab308'
  if (mag >= 4) return '#22c55e'
  return '#0ea5e9'
}

/**
 * 切换底图
 */
function switchBaseLayer(type) {
  if (!map || currentBaseLayer.value === type) return
  
  if (currentTileLayer) {
    map.removeLayer(currentTileLayer)
  }
  
  const config = baseLayers[type]
  currentTileLayer = L.tileLayer(config.url, config.options).addTo(map)
  currentBaseLayer.value = type
}

/**
 * 切换热力图
 */
function toggleHeatmap() {
  isHeatmapMode.value = !isHeatmapMode.value
  renderLayers()
}

/**
 * 渲染热力图
 */
function renderHeatmap(features) {
  if (!map) return
  
  if (heatLayer) {
    map.removeLayer(heatLayer)
    heatLayer = null
  }
  
  if (!features.length) return
  
  const points = features.map(f => {
    const coords = f.geometry?.coordinates || []
    if (coords.length < 2) return null
    const mag = f.properties?.mag || 0
    const intensity = Math.max(0.5, (mag + 1) / 8.0)
    return [coords[1], coords[0], intensity]
  }).filter(Boolean)
  
  if (points.length) {
    heatLayer = L.heatLayer(points, {
      radius: 50,
      blur: 30,
      maxZoom: 14,
      max: 1.0,
      gradient: {
        0.2: '#0ea5e9',
        0.4: '#10b981',
        0.6: '#fbbf24',
        0.8: '#f97316',
        1.0: '#ef4444'
      }
    }).addTo(map)
  }
}

/**
 * 渲染标记
 */
function renderMarkers(features) {
  if (!layerGroup) return
  
  layerGroup.clearLayers()
  
  if (!features.length) return
  
  features.forEach((feature) => {
    const coords = feature.geometry?.coordinates || []
    if (coords.length < 2) return
    
    const [lon, lat] = coords
    const mag = feature.properties?.mag || 0
    const place = feature.properties?.place || '未知位置'
    const depth = coords[2] || 0
    const time = feature.properties?.time
    const timeStr = time ? new Date(time).toLocaleString() : '未知'
    
    const marker = L.circleMarker([lat, lon], {
      radius: Math.max(4, mag * 2),
      fillColor: getColorByMag(mag),
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    })
    
    marker.bindPopup(`
      <div class="font-bold text-base mb-1">${place}</div>
      <div class="text-sm text-gray-600">震级: <span class="font-mono font-bold" style="color:${getColorByMag(mag)}">${mag.toFixed(1)}</span></div>
      <div class="text-sm text-gray-600">深度: ${depth.toFixed(1)} km</div>
      <div class="text-xs text-gray-500 mt-1">${timeStr}</div>
    `)
    
    layerGroup.addLayer(marker)
  })
}

/**
 * 渲染图层
 */
function renderLayers() {
  const features = store.features
  
  if (isHeatmapMode.value) {
    // 热力图模式
    if (layerGroup) layerGroup.clearLayers()
    renderHeatmap(features)
  } else {
    // 标记模式
    if (heatLayer) {
      map?.removeLayer(heatLayer)
      heatLayer = null
    }
    renderMarkers(features)
  }
  
  // 自适应视图
  if (features.length && map) {
    const bounds = isHeatmapMode.value 
      ? heatLayer?.getBounds?.() 
      : layerGroup?.getBounds?.()
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds.pad(0.1))
    }
  }
}

/**
 * 初始化地图
 */
onMounted(() => {
  if (!mapEl.value) return
  
  map = L.map(mapEl.value, {
    center: [35, 105],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false // 使用自定义控制
  })
  
  // 添加默认底图
  switchBaseLayer('gaode')
  
  // 创建图层组
  layerGroup = L.layerGroup().addTo(map)
  
  // 暴露方法给父组件
  window.mapInstance = {
    zoomIn: () => map?.zoomIn(),
    zoomOut: () => map?.zoomOut(),
    switchLayer: switchBaseLayer,
    toggleHeatmap
  }
})

/**
 * 监听数据变化
 */
watch(() => store.features, renderLayers, { deep: true })

/**
 * 暴露方法
 */
defineExpose({
  switchBaseLayer,
  toggleHeatmap
})
</script>

<template>
  <div class="relative w-full h-full">
    <!-- 地图容器 -->
    <div ref="mapEl" class="w-full h-full" />
    
    <!-- 图例 -->
    <div class="absolute bottom-4 left-4 bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg z-10">
      <div class="text-sm font-bold mb-2">震级图例</div>
      <div class="space-y-1 text-xs">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background: #ef4444"></span>
          <span>≥ 7.0</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background: #f97316"></span>
          <span>6.0 - 7.0</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background: #eab308"></span>
          <span>5.0 - 6.0</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background: #22c55e"></span>
          <span>4.0 - 5.0</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background: #0ea5e9"></span>
          <span>< 4.0</span>
        </div>
      </div>
    </div>
  </div>
</template>
