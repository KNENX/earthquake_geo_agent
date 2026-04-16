<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useEarthquakeStore } from '@/stores/earthquake'
import SearchBar from './components/SearchBar.vue'
import InfoPanel from './components/InfoPanel.vue'
import MapContainer from './components/MapContainer.vue'
import ChatSidebar from './components/ChatSidebar.vue'
import MissionControl from './components/MissionControl.vue'
import { DataAnalysis } from '@element-plus/icons-vue'

const store = useEarthquakeStore()

function handleKeyDown(e) {
  // ESC 键触发收起面板
  if (e.key === 'Escape' && store.showInfoPanel && store.hasData) {
    store.showInfoPanel = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <!-- 根容器：全屏，相对定位 -->
  <div class="relative w-screen h-screen overflow-hidden bg-gray-50">
    <!-- 1. 地图层：全屏背景 -->
    <MapContainer class="absolute inset-0 z-0" />

    <!-- 2. 搜索栏：顶部居中 -->
    <SearchBar class="absolute top-4 left-1/2 -translate-x-1/2 z-10" />

    <!-- 3. 左侧面板：信息展示 (加入渐变划入划出效果) -->
    <transition name="el-zoom-in-left">
      <InfoPanel v-show="store.showInfoPanel && store.hasData" class="absolute top-20 left-4 w-[360px] z-10" />
    </transition>

    <!-- 4. 聊天面板：右侧可收起 -->
    <ChatSidebar class="absolute top-20 right-4 z-10" />

    <!-- 5. 右下角工具栏 -->
    <MissionControl class="absolute bottom-4 right-4 z-10" />

    <!-- 6. 展开数据面板的呼出按钮 (左下角) -->
    <transition name="el-fade-in">
      <el-button 
        v-if="!store.showInfoPanel && store.hasData"
        circle 
        size="large" 
        class="absolute bottom-4 left-4 z-10 shadow-lg" 
        title="展开数据监控面板"
        @click="store.showInfoPanel = true"
      >
        <el-icon><DataAnalysis /></el-icon>
      </el-button>
    </transition>
  </div>
</template>
