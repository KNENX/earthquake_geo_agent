<script setup>
import { ref } from 'vue'
import { Search, Location, Filter } from '@element-plus/icons-vue'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const query = ref('') // 搜索内容

/**
 * 执行搜索
 */
async function handleSearch() {
  if (!query.value.trim()) {
    ElMessage.warning('请输入查询内容')
    return
  }

  try {
    await store.search(query.value)
    query.value = ''
  } catch (err) {
    // 错误已在 store 中处理
  }
}

/**
 * 使用当前位置
 */
function useCurrentLocation() {
  if (!navigator.geolocation) {
    ElMessage.error('浏览器不支持定位')
    return
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(2)
      const lon = pos.coords.longitude.toFixed(2)
      query.value = `坐标 ${lat}, ${lon} 附近 500km 内的地震`
      ElMessage.success('定位成功')
    },
    () => ElMessage.error('定位失败，请检查权限设置')
  )
}
</script>

<template>
  <div class="flex items-center gap-3 p-4 bg-white/90 backdrop-blur rounded-lg shadow-lg">
    <!-- 输入框 -->
    <el-input
      v-model="query"
      placeholder="输入指令：如 过去7天日本地震"
      clearable
      class="w-96"
      @keyup.enter="handleSearch"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <!-- 定位按钮 -->
    <el-button circle @click="useCurrentLocation">
      <el-icon><Location /></el-icon>
    </el-button>

    <!-- 筛选按钮 -->
    <el-button circle @click="store.toggleFilter">
      <el-icon><Filter /></el-icon>
    </el-button>

    <!-- 查询按钮 -->
    <el-button
      type="primary"
      :loading="store.loading"
      @click="handleSearch"
    >
      查询
    </el-button>
  </div>
</template>
