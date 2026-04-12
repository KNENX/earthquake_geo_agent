import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useEarthquakeStore } from './earthquake'

/**
 * 筛选状态管理
 */
export const useFilterStore = defineStore('filter', () => {
  const earthquakeStore = useEarthquakeStore()

  // ========== State ==========
  const magRange = ref([0, 10])      // 震级范围 [最小, 最大]
  const depthRange = ref([0, 700])   // 深度范围 [最小, 最大] km
  const isFiltering = ref(false)     // 是否正在筛选

  // ========== Getters ==========
  
  /**
   * 筛选后的地震数据
   */
  const filteredFeatures = computed(() => {
    if (!isFiltering.value) {
      return earthquakeStore.features
    }
    
    return earthquakeStore.features.filter(feature => {
      const mag = feature.properties?.mag
      const coords = feature.geometry?.coordinates || []
      const depth = coords[2] || 0
      
      // 震级筛选
      if (mag < magRange.value[0] || mag > magRange.value[1]) {
        return false
      }
      
      // 深度筛选
      if (depth < depthRange.value[0] || depth > depthRange.value[1]) {
        return false
      }
      
      return true
    })
  })
  
  /**
   * 筛选后的数量
   */
  const filteredCount = computed(() => filteredFeatures.value.length)
  
  /**
   * 原始数量
   */
  const originalCount = computed(() => earthquakeStore.features.length)
  
  /**
   * 是否有筛选条件
   */
  const hasFilter = computed(() => {
    return magRange.value[0] > 0 || 
           magRange.value[1] < 10 || 
           depthRange.value[0] > 0 || 
           depthRange.value[1] < 700
  })

  // ========== Actions ==========
  
  /**
   * 设置震级范围
   * @param {number[]} range - [最小, 最大]
   */
  function setMagRange(range) {
    magRange.value = range
  }
  
  /**
   * 设置深度范围
   * @param {number[]} range - [最小, 最大]
   */
  function setDepthRange(range) {
    depthRange.value = range
  }
  
  /**
   * 应用筛选
   */
  function applyFilter() {
    isFiltering.value = true
  }
  
  /**
   * 重置筛选
   */
  function resetFilter() {
    magRange.value = [0, 10]
    depthRange.value = [0, 700]
    isFiltering.value = false
  }
  
  /**
   * 清除筛选（保留范围值，但不起作用）
   */
  function clearFilter() {
    isFiltering.value = false
  }

  return {
    // State
    magRange,
    depthRange,
    isFiltering,
    // Getters
    filteredFeatures,
    filteredCount,
    originalCount,
    hasFilter,
    // Actions
    setMagRange,
    setDepthRange,
    applyFilter,
    resetFilter,
    clearFilter
  }
})
