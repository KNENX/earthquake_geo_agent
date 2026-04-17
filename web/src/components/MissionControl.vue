<script setup>
import { ref } from 'vue'
import { Plus, Minus, MapLocation, DataLine, Download } from '@element-plus/icons-vue'
import { mapEventBus } from '@/composables/useMapControl'
import { useExport } from '@/composables/useExport'
import { useEarthquakeStore } from '@/stores/earthquake'

const { exportCSV, exportGeoJSON } = useExport()
const store = useEarthquakeStore()

const currentLayer = ref('gaode')
const isHeatmap = ref(false)

/**
 * 放大
 */
function zoomIn() {
  mapEventBus.trigger({ type: 'zoomIn' })
}

/**
 * 缩小
 */
function zoomOut() {
  mapEventBus.trigger({ type: 'zoomOut' })
}

/**
 * 切换底图
 */
function switchLayer() {
  const layers = ['gaode', 'satellite', 'dark']
  const currentIndex = layers.indexOf(currentLayer.value)
  const nextIndex = (currentIndex + 1) % layers.length
  currentLayer.value = layers[nextIndex]
  mapEventBus.trigger({ type: 'switchLayer', payload: currentLayer.value })
}

/**
 * 切换热力图
 */
function toggleHeatmap() {
  isHeatmap.value = !isHeatmap.value
  mapEventBus.trigger({ type: 'toggleHeatmap' })
}

/**
 * 导出数据
 */
function exportData(type) {
  if (type === 'CSV') exportCSV(store.features)
  if (type === 'GeoJSON') exportGeoJSON(store.features)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 底图切换 -->
    <el-button
      circle
      size="large"
      class="shadow-lg"
      :class="{ 'bg-blue-100': currentLayer !== 'gaode' }"
      title="切换底图"
      @click="switchLayer"
    >
      <el-icon><MapLocation /></el-icon>
    </el-button>

    <!-- 热力图开关 -->
    <el-button
      circle
      size="large"
      class="shadow-lg"
      :class="{ 'bg-orange-100': isHeatmap }"
      title="热力图"
      @click="toggleHeatmap"
    >
      <el-icon><DataLine /></el-icon>
    </el-button>

    <!-- 放大 -->
    <el-button circle size="large" class="shadow-lg" title="放大" @click="zoomIn">
      <el-icon><Plus /></el-icon>
    </el-button>

    <!-- 缩小 -->
    <el-button circle size="large" class="shadow-lg" title="缩小" @click="zoomOut">
      <el-icon><Minus /></el-icon>
    </el-button>

    <!-- 导出 -->
    <el-dropdown trigger="click" placement="left">
      <el-button circle size="large" class="shadow-lg" title="导出数据">
        <el-icon><Download /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="exportData('CSV')">导出 CSV</el-dropdown-item>
          <el-dropdown-item @click="exportData('GeoJSON')">导出 GeoJSON</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>
