<script setup>
import { computed, ref } from 'vue'
import { useEarthquakeStore } from '@/stores/earthquake'
import { useFilterStore } from '@/stores/filter'
import { mapEventBus } from '@/composables/useMapControl'

const store = useEarthquakeStore()
const filterStore = useFilterStore()
const showAll = ref(false)
const MAX_VISIBLE = 5

/**
 * 排序后的地震列表（按震级降序）
 */
const sortedFeatures = computed(() => {
  return [...filterStore.filteredFeatures].sort((a, b) => {
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
  
  const [lon, lat] = coords
  mapEventBus.trigger({ type: 'flyTo', payload: { lat, lon } })
}
</script>

<template>
  <div class="space-y-2.5 pb-4">
    <!-- 地震列表项 -->
    <div
      v-for="feature in visibleFeatures"
      :key="feature.id"
      class="flex items-center gap-3 p-2.5 rounded-xl bg-white/60 hover:bg-white border border-slate-200/60 shadow-sm cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md group"
      @click="flyToLocation(feature)"
    >
      <!-- 震级徽章（圆角方块带高光边缘） -->
      <div
        class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-extrabold text-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_2px_4px_rgba(0,0,0,0.1)] transition-transform group-hover:scale-105 group-hover:rotate-3"
        :style="{ backgroundColor: getMagColor(feature.properties?.mag) }"
      >
        <span>{{ formatMag(feature.properties?.mag) }}</span>
      </div>
      
      <!-- 信息 -->
      <div class="flex-1 min-w-0 flex flex-col justify-center">
        <div class="text-[13px] font-bold text-slate-800 truncate" :title="feature.properties?.place">
          {{ feature.properties?.place || '未知位置' }}
        </div>
        <div class="text-[11px] text-slate-500 flex gap-2 mt-1">
          <span class="bg-slate-100/80 px-1.5 py-0.5 rounded shadow-inner text-slate-600">{{ formatTime(feature.properties?.time) }}</span>
          <span class="bg-slate-100/80 px-1.5 py-0.5 rounded shadow-inner text-slate-600">{{ formatDepth(feature.geometry?.coordinates) }} km</span>
        </div>
      </div>
    </div>
    
    <!-- 展开/收起按钮 -->
    <div v-if="sortedFeatures.length > MAX_VISIBLE" class="pt-3 pb-2 text-center">
      <div 
        @click="showAll = !showAll"
        class="inline-block px-5 py-2 rounded-full text-xs font-bold tracking-wider bg-slate-100/80 text-slate-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-colors border border-slate-200/60 shadow-sm"
      >
        {{ showAll ? '收 起 (↑)' : `显示更多 (${remainingCount} 条) ↓` }}
      </div>
    </div>
  </div>
</template>
