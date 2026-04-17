<script setup>
import { ref, watch } from 'vue'
import { Search, Location, Filter, Close } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const query = ref('') // 搜索内容

// ========== 搜索历史记录管理 (localStorage) ==========
const HISTORY_KEY = 'earthquake_search_history'
const searchHistory = ref(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))

// 拦截存储自动补全的回调句柄，以便能够随时手动刷新组件 DOM
let autocompleteCb = null
let currentSearchString = ''

watch(searchHistory, (newHistory) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
}, { deep: true })

/**
 * 记录新的查询词
 */
function addHistory(text) {
  if (!text) return
  // 移除旧记录，防止重复
  searchHistory.value = searchHistory.value.filter(item => item !== text)
  // 插入到最前面
  searchHistory.value.unshift(text)
  // 保持最多 5 条
  if (searchHistory.value.length > 5) {
    searchHistory.value.pop()
  }
}

/**
 * 删除指定历史记录
 */
function removeHistory(text) {
  searchHistory.value = searchHistory.value.filter(item => item !== text)
  // 通过主动触发之前存储的组件渲染回调，让弹出列表立刻感知到删除动作并重绘 DOM
  if (autocompleteCb) {
    querySearch(currentSearchString, autocompleteCb)
  }
}

/**
 * 提供给 el-autocomplete 的建议列表
 */
function querySearch(queryString, cb) {
  // 每次触发检索时，顺手截下当前查询串和回调器钩子
  currentSearchString = queryString
  autocompleteCb = cb

  let results = searchHistory.value.map(val => ({ value: val }))
  
  if (queryString) {
    results = results.filter(item => 
      item.value.toLowerCase().includes(queryString.toLowerCase())
    )
  }
  
  cb(results)
}

/**
 * 当用户选中补全列表项时立刻触发查询
 */
function handleSelect(item) {
  query.value = item.value
  handleSearch()
}
// ====================================================

/**
 * 执行搜索
 */
async function handleSearch() {
  if (!query.value.trim()) {
    ElMessage.warning('请输入查询内容')
    return
  }

  try {
    const executedQuery = query.value
    await store.search(executedQuery)
    // 只有在没报错查询成功时，才把关键词塞入历史记录栈
    addHistory(executedQuery)
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
    <!-- 输入框/带历史记录补全 -->
    <el-autocomplete
      v-model="query"
      :fetch-suggestions="querySearch"
      placeholder="输入指令：如 过去7天日本地震"
      clearable
      class="w-96"
      @select="handleSelect"
      @keyup.enter="handleSearch"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>

      <!-- 自定义下拉项的模板：带删除按钮 -->
      <template #default="{ item }">
        <div class="flex justify-between items-center w-full group">
          <span class="truncate pr-4 text-gray-700">{{ item.value }}</span>
          <el-button 
            type="danger" 
            link 
            size="small"
            class="opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除此记录"
            @click.stop="removeHistory(item.value)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </template>
    </el-autocomplete>

    <!-- 定位按钮 -->
    <el-button circle title="定位" @click="useCurrentLocation">
      <el-icon><Location /></el-icon>
    </el-button>

    <!-- 筛选按钮 -->
    <el-button circle title="二次筛选" @click="store.toggleFilter">
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
