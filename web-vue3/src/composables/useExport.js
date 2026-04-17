import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 导出功能组合式函数
 */
export function useExport() {
  const exporting = ref(false)

  /**
   * 转换为 CSV 格式
   * @param {Array} features - 地震数据
   * @returns {string} CSV 内容
   */
  function convertToCSV(features) {
    const headers = ['Time', 'Magnitude', 'Place', 'Depth (km)', 'Latitude', 'Longitude', 'USGS ID', 'URL']
    
    const rows = features.map(f => {
      const p = f.properties || {}
      const c = f.geometry?.coordinates || []
      
      const time = p.time ? new Date(p.time).toISOString() : ''
      const mag = p.mag || ''
      const place = `"${(p.place || '').replace(/"/g, '""')}"`
      const depth = c[2] || ''
      const lat = c[1] || ''
      const lon = c[0] || ''
      const id = f.id || ''
      const url = p.url || ''
      
      return [time, mag, place, depth, lat, lon, id, url].join(',')
    })
    
    return [headers.join(','), ...rows].join('\n')
  }

  /**
   * 转换为 GeoJSON 格式
   * @param {Array} features - 地震数据
   * @returns {string} GeoJSON 内容
   */
  function convertToGeoJSON(features) {
    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        generated: new Date().getTime(),
        title: 'Exported from Earthquake Agent'
      },
      features: features
    }
    
    return JSON.stringify(geojson, null, 2)
  }

  /**
   * 下载文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @param {string} mimeType - MIME 类型
   */
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    URL.revokeObjectURL(url)
  }

  /**
   * 导出 CSV
   * @param {Array} features - 地震数据
   */
  function exportCSV(features) {
    if (!features?.length) {
      ElMessage.warning('没有数据可导出')
      return
    }
    
    exporting.value = true
    try {
      const content = convertToCSV(features)
      const timestamp = new Date().toISOString().slice(0, 10)
      downloadFile(content, `earthquakes_${timestamp}.csv`, 'text/csv;charset=utf-8;')
      ElMessage.success('CSV 导出成功')
    } catch (err) {
      ElMessage.error('导出失败：' + err.message)
    } finally {
      exporting.value = false
    }
  }

  /**
   * 导出 GeoJSON
   * @param {Array} features - 地震数据
   */
  function exportGeoJSON(features) {
    if (!features?.length) {
      ElMessage.warning('没有数据可导出')
      return
    }
    
    exporting.value = true
    try {
      const content = convertToGeoJSON(features)
      const timestamp = new Date().toISOString().slice(0, 10)
      downloadFile(content, `earthquakes_${timestamp}.geojson`, 'application/geo+json')
      ElMessage.success('GeoJSON 导出成功')
    } catch (err) {
      ElMessage.error('导出失败：' + err.message)
    } finally {
      exporting.value = false
    }
  }

  return {
    exporting,
    exportCSV,
    exportGeoJSON
  }
}
