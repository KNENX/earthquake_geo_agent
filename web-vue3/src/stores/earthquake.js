import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchEarthquakeData } from '@/api'

/**
 * 地震数据状态管理
 */
export const useEarthquakeStore = defineStore('earthquake', () => {
  // ========== State ==========
  const features = ref([])           // 地震数据列表
  const loading = ref(false)         // 加载状态
  const error = ref(null)            // 错误信息
  const stats = ref(null)            // 统计信息
  const currentPlan = ref(null)      // 当前查询计划
  const showFilter = ref(false)      // 筛选面板显示

  // ========== Getters ==========
  const count = computed(() => features.value.length)
  const hasData = computed(() => count.value > 0)
  const maxMagnitude = computed(() => {
    if (!features.value.length) return 0
    return Math.max(...features.value.map(f => f.properties.mag || 0))
  })

  // ========== Actions ==========
  /**
   * 查询地震数据
   * @param {string} query - 用户输入的查询语句
   */
  async function search(query) {
    loading.value = true
    error.value = null

    try {
      const data = await fetchEarthquakeData(query)
      features.value = data.geojson?.features || []
      stats.value = data.stats || null
      currentPlan.value = data.plan || null
    } catch (err) {
      error.value = err.message || '查询失败'
      features.value = []
      stats.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * 清空数据
   */
  function clear() {
    features.value = []
    stats.value = null
    currentPlan.value = null
    error.value = null
  }

  /**
   * 切换筛选面板
   */
  function toggleFilter() {
    showFilter.value = !showFilter.value
  }

  return {
    // State
    features, loading, error, stats, currentPlan, showFilter,
    // Getters
    count, hasData, maxMagnitude,
    // Actions
    search, clear, toggleFilter
  }
})
