<script setup>
import { ref, onMounted, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const mapEl = ref(null)
let map = null
let layerGroup = null

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
 * 初始化地图
 */
onMounted(() => {
  if (!mapEl.value) return

  // 创建地图
  map = L.map(mapEl.value, {
    center: [35, 105],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18
  })

  // 添加底图（高德）
  L.tileLayer(
    'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    { maxZoom: 18, attribution: '© 高德地图' }
  ).addTo(map)

  // 创建图层组
  layerGroup = L.layerGroup().addTo(map)
})

/**
 * 监听数据变化，自动渲染
 */
watch(() => store.features, (features) => {
  if (!map || !layerGroup) return

  // 清除旧图层
  layerGroup.clearLayers()

  if (!features.length) return

  // 添加新标记
  features.forEach((feature) => {
    const coords = feature.geometry?.coordinates || []
    if (coords.length < 2) return

    const [lon, lat] = coords
    const mag = feature.properties?.mag || 0
    const place = feature.properties?.place || '未知位置'

    // 创建圆形标记
    const marker = L.circleMarker([lat, lon], {
      radius: Math.max(4, mag * 2),
      fillColor: getColorByMag(mag),
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    })

    // 绑定弹出框
    marker.bindPopup(`
      <div class="font-bold">${place}</div>
      <div>震级: ${mag}</div>
      <div>坐标: ${lat.toFixed(2)}, ${lon.toFixed(2)}</div>
    `)

    layerGroup.addLayer(marker)
  })

  // 自适应视图
  const bounds = layerGroup.getBounds()
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.1))
  }
}, { deep: true })
</script>

<template>
  <div ref="mapEl" class="w-full h-full" />
</template>
