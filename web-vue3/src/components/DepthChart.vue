<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import Chart from 'chart.js/auto'

const props = defineProps({
  features: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null

/**
 * 计算深度分布
 */
function calculateDepthDistribution(features) {
  const dist = {
    '浅源 (0-70km)': 0,
    '中源 (70-300km)': 0,
    '深源 (>300km)': 0
  }
  
  features.forEach(f => {
    const coords = f.geometry?.coordinates || []
    const depth = coords[2] || 0
    
    if (depth <= 70) dist['浅源 (0-70km)']++
    else if (depth <= 300) dist['中源 (70-300km)']++
    else dist['深源 (>300km)']++
  })
  
  return dist
}

/**
 * 渲染图表
 */
function renderChart() {
  if (!chartRef.value) return
  
  const distribution = calculateDepthDistribution(props.features)
  
  // 如果有旧图表，销毁
  if (chart) {
    chart.destroy()
    chart = null
  }
  
  // 如果没有数据，不渲染
  if (!props.features.length) return
  
  // 创建新图表
  const ctx = chartRef.value.getContext('2d')
  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(distribution),
      datasets: [{
        data: Object.values(distribution),
        backgroundColor: [
          '#e879f9', // 浅源 粉色
          '#c026d3', // 中源 紫色
          '#701a75'  // 深源 深紫
        ],
        borderWidth: 1,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0
              return `${context.label}: ${value} (${percentage}%)`
            }
          }
        }
      }
    }
  })
}

onMounted(renderChart)
onUnmounted(() => chart?.destroy())

// 监听数据变化
watch(() => props.features, renderChart, { deep: true })
</script>

<template>
  <canvas ref="chartRef" class="w-full h-full" />
</template>
