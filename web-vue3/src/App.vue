<script setup>
import SearchBar from './components/SearchBar.vue'
import InfoPanel from './components/InfoPanel.vue'
import MapContainer from './components/MapContainer.vue'
import ChatSidebar from './components/ChatSidebar.vue'
import MissionControl from './components/MissionControl.vue'
</script>

<template>
  <!-- 根容器：全屏，相对定位 -->
  <div class="relative w-screen h-screen overflow-hidden bg-gray-50">
    <!-- 1. 地图层：全屏背景 -->
    <MapContainer class="absolute inset-0 z-0" />

    <!-- 2. 搜索栏：顶部居中 -->
    <SearchBar class="absolute top-4 left-1/2 -translate-x-1/2 z-10" />

    <!-- 3. 左侧面板：信息展示 -->
    <InfoPanel class="absolute top-20 left-4 w-80 z-10" />

    <!-- 4. 聊天面板：右侧可收起 -->
    <ChatSidebar class="absolute top-20 right-4 z-10" />

    <!-- 5. 右下角工具栏 -->
    <MissionControl class="absolute bottom-4 right-4 z-10" />
  </div>
</template>

<style>
/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
