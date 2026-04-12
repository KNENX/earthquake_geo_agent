<script setup>
import { computed } from 'vue'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()

/**
 * 格式化震级
 */
function formatMag(mag) {
  if (mag == null || isNaN(mag)) return '-'
  return mag.toFixed(1)
}
</script>

<template>
  <div class="flex flex-col gap-4">
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
    </el-card>

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
        <span class="font-bold">筛选条件</span>
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
