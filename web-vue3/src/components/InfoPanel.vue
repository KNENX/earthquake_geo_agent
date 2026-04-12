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
  <div class="flex flex-col gap-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
    <!-- 统计卡片 -->
    <el-card v-if="store.hasData" class="shadow-lg">
      <div class="flex gap-4">
        <div class="flex-1 text-center">
          <div class="text-3xl font-bold text-gray-800">{{ store.count }}</div>
          <div class="text-sm text-gray-500">监测数量</div>
        </div>
        <div class="flex-1 text-center">
          <div class="text-3xl font-bold text-orange-500">{{ formatMag(store.maxMagnitude) }}</div>
          <div class="text-sm text-gray-500">最大震级</div>
        </div>
      </div>
      <div v-if="avgMagnitude > 0" class="mt-4 pt-4 border-t text-center">
        <span class="text-gray-500">平均震级: </span>
        <span class="text-lg font-bold text-blue-500">{{ formatMag(avgMagnitude) }}</span>
      </div>
    </el-card>

    <!-- 筛选条件 -->
    <el-card v-if="store.hasData && store.currentPlan" class="shadow-lg">
      <template #header>
        <div class="font-bold">筛选条件</div>
      </template>
      <div class="space-y-2 text-sm">
        <div v-if="timeRange" class="flex justify-between">
          <span class="text-gray-500">时间范围:</span>
          <span>{{ timeRange }}</span>
        </div>
        <div v-if="store.currentPlan.minmagnitude || store.currentPlan.maxmagnitude" class="flex justify-between">
          <span class="text-gray-500">震级范围:</span>
          <span>{{ store.currentPlan.minmagnitude || 0 }} - {{ store.currentPlan.maxmagnitude || 10 }}</span>
        </div>
      </div>
    </el-card>

    <!-- 震级分布图表 -->
    <el-card v-if="store.hasData" class="shadow-lg">
      <template #header>
        <div class="font-bold">震级分布</div>
      </template>
      <div class="h-48">
        <MagChart :features="store.features" />
      </div>
    </el-card>

    <!-- 深度分布图表 -->
    <el-card v-if="store.hasData" class="shadow-lg">
      <template #header>
        <div class="font-bold">深度分布</div>
      </template>
      <div class="h-48">
        <DepthChart :features="store.features" />
      </div>
    </el-card>

    <!-- 地震列表 -->
    <QuakeList />

    <!-- 空状态 -->
    <el-card v-else class="shadow-lg">
      <div class="text-center text-gray-400 py-8">
        <el-icon :size="48" class="mb-2"><DataLine /></el-icon>
        <div>请输入查询条件开始搜索</div>
      </div>
    </el-card>

    <!-- 筛选面板（条件显示） -->
    <el-card v-if="store.showFilter" class="shadow-lg">
      <template #header>
        <div class="font-bold">二次筛选</div>
      </template>
      <div class="space-y-4">
        <div>
          <div class="text-sm text-gray-500 mb-2">震级范围</div>
          <el-slider range :min="0" :max="10" :step="0.1" />
        </div>
        <div>
          <div class="text-sm text-gray-500 mb-2">深度范围 (km)</div>
          <el-slider range :min="0" :max="700" :step="10" />
        </div>
      </div>
    </el-card>
  </div>
</template>
