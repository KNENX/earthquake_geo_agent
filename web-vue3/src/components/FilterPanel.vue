<script setup>
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { useEarthquakeStore } from '@/stores/earthquake'

const filterStore = useFilterStore()
const earthquakeStore = useEarthquakeStore()

/**
 * 格式化范围显示
 */
const magRangeText = computed(() => {
  return `${filterStore.magRange[0]} - ${filterStore.magRange[1]} 级`
})

const depthRangeText = computed(() => {
  return `${filterStore.depthRange[0]} - ${filterStore.depthRange[1]} km`
})

/**
 * 应用筛选
 */
function applyFilter() {
  filterStore.applyFilter()
  earthquakeStore.showFilter = false
}

/**
 * 重置筛选
 */
function resetFilter() {
  filterStore.resetFilter()
}
</script>

<template>
  <div class="bg-white/90 backdrop-blur rounded-lg shadow-lg p-4 w-80">
    <div class="flex items-center justify-between mb-4">
      <span class="font-bold text-gray-800">二次筛选</span>
      <el-button text size="small" @click="earthquakeStore.showFilter = false">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <!-- 震级筛选 -->
    <div class="mb-4">
      <div class="flex justify-between mb-2">
        <span class="text-sm text-gray-600">震级范围</span>
        <span class="text-sm font-medium text-blue-600">{{ magRangeText }}</span>
      </div>
      <el-slider
        v-model="filterStore.magRange"
        range
        :min="0"
        :max="10"
        :step="0.1"
      />
    </div>

    <!-- 深度筛选 -->
    <div class="mb-4">
      <div class="flex justify-between mb-2">
        <span class="text-sm text-gray-600">深度范围</span>
        <span class="text-sm font-medium text-blue-600">{{ depthRangeText }}</span>
      </div>
      <el-slider
        v-model="filterStore.depthRange"
        range
        :min="0"
        :max="700"
        :step="10"
      />
    </div>

    <!-- 筛选结果预览 -->
    <div v-if="filterStore.hasFilter" class="mb-4 p-2 bg-blue-50 rounded text-sm">
      <span class="text-gray-600">符合条件：</span>
      <span class="font-bold text-blue-600">{{ filterStore.filteredCount }}</span>
      <span class="text-gray-600"> / {{ filterStore.originalCount }} 条</span>
    </div>

    <!-- 按钮组 -->
    <div class="flex gap-2">
      <el-button class="flex-1" @click="resetFilter">
        重置
      </el-button>
      <el-button type="primary" class="flex-1" @click="applyFilter">
        应用筛选
      </el-button>
    </div>
  </div>
</template>
