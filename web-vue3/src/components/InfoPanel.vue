<script setup>
import { computed } from 'vue'
import { useEarthquakeStore } from '@/stores/earthquake'
import { useFilterStore } from '@/stores/filter'
import MagChart from './MagChart.vue'
import DepthChart from './DepthChart.vue'
import QuakeList from './QuakeList.vue'

const store = useEarthquakeStore()
const filterStore = useFilterStore()

/**
 * 格式化震级
 */
function formatMag(mag) {
  if (mag == null || isNaN(mag)) return '-'
  return mag.toFixed(2)
}

/**
 * 格式化深度
 */
function formatDepth(depth) {
  if (depth == null || isNaN(depth)) return '-'
  return depth.toFixed(1)
}

/**
 * 计算平均震级
 */
const avgMagnitude = computed(() => {
  if (!store.features.length) return 0
  const sum = store.features.reduce((acc, f) => acc + (f.properties?.mag || 0), 0)
  return sum / store.features.length
})

/**
 * 格式化时间范围
 */
const timeRange = computed(() => {
  const plan = store.currentPlan
  if (!plan) return ''
  
  if (plan.starttime) {
    const start = plan.starttime.split('T')[0]
    const end = plan.endtime ? plan.endtime.split('T')[0] : '现在'
    return `${start} 至 ${end}`
  }
  
  if (plan.window_value) {
    const unit = plan.window_unit === 'hours' ? '小时' : '天'
    return `过去 ${plan.window_value} ${unit}`
  }
  
  return ''
})
</script>

<template>
  <div class="flex flex-col max-h-[calc(100vh-6rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
    
    <div v-if="store.hasData" class="flex flex-col h-full overflow-y-auto custom-scrollbar p-4 space-y-4">
      <!-- 统计指标区 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-slate-50/80 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 shadow-sm relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 bg-slate-200/40 w-16 h-16 rounded-full blur-xl"></div>
          <div class="text-3xl font-extrabold text-slate-800 tracking-tight relative">{{ store.count }}</div>
          <div class="text-xs text-slate-500 font-medium mt-0.5 relative">监测数量</div>
        </div>
        <div class="bg-slate-50/80 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 shadow-sm relative overflow-hidden">
          <div class="absolute -right-2 -bottom-2 bg-orange-100 w-16 h-16 rounded-full blur-xl"></div>
          <div class="text-3xl font-extrabold text-orange-500 tracking-tight relative">{{ formatMag(store.maxMagnitude) }}</div>
          <div class="text-xs text-slate-500 font-medium mt-0.5 relative">最大震级</div>
        </div>
      </div>

      <!-- 两个图表并排 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-slate-50/50 rounded-xl p-2 border border-slate-200/60 shadow-sm">
           <div class="text-[11px] font-bold text-slate-500 mb-1.5 text-center tracking-wide">震级分布</div>
           <div class="h-[100px]"><MagChart :features="filterStore.filteredFeatures" /></div>
        </div>
        <div class="bg-slate-50/50 rounded-xl p-2 border border-slate-200/60 shadow-sm">
           <div class="text-[11px] font-bold text-slate-500 mb-1.5 text-center tracking-wide">深度概况</div>
           <div class="h-[100px]"><DepthChart :features="filterStore.filteredFeatures" /></div>
        </div>
      </div>

      <!-- 当前筛选条件概述 (文字极简版) -->
      <div class="px-1 mt-1">
         <div class="text-[11px] font-bold text-blue-500 mb-2 border-b border-blue-500/10 pb-1.5">筛选条件 (FILTER CRITERIA)</div>
         <div class="space-y-2 text-xs">
           <div class="flex items-center"><span class="text-slate-400 w-[70px]">时间范围:</span><span class="text-slate-700 font-medium">{{ timeRange || '不限' }}</span></div>
           <div class="flex items-center"><span class="text-slate-400 w-[70px]">震级筛选:</span><span class="text-slate-700 font-medium">{{ filterStore.magRange[0] === 0 && filterStore.magRange[1] === 10 ? '全部震级' : `${filterStore.magRange[0]} - ${filterStore.magRange[1]} 级` }}</span></div>
           <div class="flex items-center"><span class="text-slate-400 w-[70px]">深度筛选:</span><span class="text-slate-700 font-medium">{{ filterStore.depthRange[0] === 0 && filterStore.depthRange[1] === 700 ? '不限深度' : `${filterStore.depthRange[0]} - ${filterStore.depthRange[1]} km` }}</span></div>
           <div class="flex items-center" v-if="avgMagnitude > 0"><span class="text-slate-400 w-[70px]">平均震级:</span><span class="text-slate-700 font-medium">{{ formatMag(avgMagnitude) }}</span></div>
         </div>
      </div>

      <!-- 交互式二次筛选 (滑块) -->
      <div v-if="store.showFilter" class="bg-blue-50/60 rounded-xl p-3 border border-blue-100 shadow-inner mt-2">
        <div class="text-[11px] font-bold text-blue-600 mb-3 tracking-wide">二次筛选调节</div>
        <div class="space-y-3">
          <div class="px-1">
            <div class="text-[11px] text-slate-500 mb-1 flex justify-between"><span>震级范围</span></div>
            <el-slider v-model="filterStore.magRange" @change="filterStore.applyFilter" range :min="0" :max="10" :step="0.1" size="small" />
          </div>
          <div class="px-1">
            <div class="text-[11px] text-slate-500 mb-1 flex justify-between"><span>深度范围 (km)</span></div>
            <el-slider v-model="filterStore.depthRange" @change="filterStore.applyFilter" range :min="0" :max="700" :step="10" size="small" />
          </div>
        </div>
      </div>

      <!-- 地震列表 (事件日志) -->
      <div class="flex-1 flex flex-col min-h-[350px] mt-2">
        <div class="text-[11px] font-bold text-blue-500 mb-3 border-b border-blue-500/10 pb-1.5 flex justify-between items-end">
            <span>事件日志</span>
            <span class="text-slate-400 font-normal scale-90 origin-right">按震级排序</span>
        </div>
        <QuakeList class="flex-1 -mx-2 px-2" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.6); }

:deep(.el-slider__bar) { background-color: #3b82f6; }
:deep(.el-slider__button) { border-color: #3b82f6; }
</style>
