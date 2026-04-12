<script setup>
import { computed, ref } from 'vue'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const showAll = ref(false)
const MAX_VISIBLE = 5

/**
 * 排序后的地震列表（按震级降序）
 */
const sortedFeatures = computed(() => {
  return [...store.features].sort((a, b) => {
    return (b.properties?.mag || 0) - (a.properties?.mag || 0)
  })
})

/**
 * 显示的地震列表
 */
const visibleFeatures = computed(() => {
  if (showAll.value) return sortedFeatures.value
  return sortedFeatures.value.slice(0, MAX_VISIBLE)
})

/**
 * 剩余数量
 */
const remainingCount = computed(() => {
  return Math.max(0, sortedFeatures.value.length - MAX_VISIBLE)
})

/**
 * 格式化时间
 */
function formatTime(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 格式化震级
 */
function formatMag(mag) {
  if (mag == null || isNaN(mag)) return '-'
  return mag.toFixed(1)
}

/**
 * 获取震级颜色
 */
function getMagColor(mag) {
  if (mag >= 7) return '#ef4444'
  if (mag >= 6) return '#f97316'
  if (mag >= 5) return '#eab308'
  if (mag >= 4) return '#22c55e'
  return '#0ea5e9'
}

/**
 * 格式化深度
 */
function formatDepth(coords) {
  if (!coords || coords.length < 3) return '-'
  return coords[2].toFixed(1)
}

/**
 * 点击地震项，飞到地图位置
 */
function flyToLocation(feature) {
  const coords = feature.geometry?.coordinates
  if (!coords || coords.length < 2) return
  
  // 调用地图实例的方法
  if (window.mapInstance?.map) {
    const [lon, lat] = coords
    window.mapInstance.map.flyTo([lat, lon], 8, { duration: 1.5 })
  }
}
</script>

<template>
  <el-card v-if="store.hasData" class="shadow-lg">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-bold">地震列表</span>
        <span class="text-xs text-gray-500">按震级排序</span>
      </div>
    </template>
    
    <div class="space-y-2">
      <!-- 地震列表项 -->
      <div
        v-for="feature in visibleFeatures"
        :key="feature.id"
        class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
        @click="flyToLocation(feature)"
      >
        <!-- 震级徽章 -->
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
          :style="{ backgroundColor: getMagColor(feature.properties?.mag) }"
        >
          {{ formatMag(feature.properties?.mag) }}
        </div>
        
        <!-- 信息 -->
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate" :title="feature.properties?.place">
            {{ feature.properties?.place || '未知位置' }}
          </div>
          <div class="text-xs text-gray-500 flex gap-3">
            <span>{{ formatTime(feature.properties?.time) }}</span>
            <span>深 {{ formatDepth(feature.geometry?.coordinates) }} km</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 展开/收起按钮 -->
    <div v-if="sortedFeatures.length > MAX_VISIBLE" class="mt-4 text-center">
      <el-button text @click="showAll = !showAll">
        {{ showAll ? '收起' : `显示更多 (${remainingCount} 条)` }}
      </el-button>
    </div>
  </el-card>
</template>
