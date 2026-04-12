<script setup>
import { ref } from 'vue'
import { Plus, Minus, MapLocation, DataLine, Download } from '@element-plus/icons-vue'

const emit = defineEmits(['zoom-in', 'zoom-out', 'toggle-heat', 'export'])

const showExportMenu = ref(false)

/**
 * 导出数据
 */
function exportData(type) {
  emit('export', type)
  showExportMenu.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 图层切换 -->
    <el-button circle size="large" class="shadow-lg" title="切换底图">
      <el-icon><MapLocation /></el-icon>
    </el-button>

    <!-- 热力图开关 -->
    <el-button circle size="large" class="shadow-lg" title="热力图">
      <el-icon><DataLine /></el-icon>
    </el-button>

    <!-- 放大 -->
    <el-button circle size="large" class="shadow-lg" title="放大" @click="$emit('zoom-in')">
      <el-icon><Plus /></el-icon>
    </el-button>

    <!-- 缩小 -->
    <el-button circle size="large" class="shadow-lg" title="缩小" @click="$emit('zoom-out')">
      <el-icon><Minus /></el-icon>
    </el-button>

    <!-- 导出 -->
    <el-dropdown trigger="click" placement="left">
      <el-button circle size="large" class="shadow-lg" title="导出数据">
        <el-icon><Download /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="exportData('csv')">导出 CSV</el-dropdown-item>
          <el-dropdown-item @click="exportData('geojson')">导出 GeoJSON</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>
