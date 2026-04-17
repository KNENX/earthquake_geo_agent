import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchEarthquakeData } from '@/api'
import { useFilterStore } from './filter'

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
  const showInfoPanel = ref(true)    // 数据展示面板显示

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
      
      // 将大模型分析出的客观条件（如 >5级、深度>500）强行覆写给用户面的 UI 滑块与信息板，杜绝虚假显示
      if (currentPlan.value) {
        const filterStore = useFilterStore()
        filterStore.setMagRange([
          currentPlan.value.minmagnitude ?? 0,
          currentPlan.value.maxmagnitude ?? 10
        ])
        filterStore.setDepthRange([
          currentPlan.value.mindepth ?? 0,
          currentPlan.value.maxdepth ?? 700
        ])
      }
      
      // 显示成功提示（如果数据不为空）
      if (features.value.length > 0) {
        showInfoPanel.value = true // 查询到数据时始终自动弹开面板
        ElMessage.success(`查询成功，共找到 ${features.value.length} 条地震数据`)
      } else {
        ElMessage.warning('未找到符合条件的地震数据')
      }
      
      return data
    } catch (err) {
      error.value = err.message || '查询失败'
      features.value = []
      stats.value = null
      currentPlan.value = null
      ElMessage.error('查询失败：' + err.message)
      throw err
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
    features, loading, error, stats, currentPlan, showFilter, showInfoPanel,
    // Getters
    count, hasData, maxMagnitude,
    // Actions
    search, clear, toggleFilter
  }
})
