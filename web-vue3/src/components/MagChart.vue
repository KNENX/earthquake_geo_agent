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
 * 计算震级分布
 */
function calculateMagDistribution(features) {
  const dist = {
    '3.0-4.0': 0,
    '4.0-5.0': 0,
    '5.0-6.0': 0,
    '6.0-7.0': 0,
    '7.0+': 0
  }
  
  features.forEach(f => {
    const mag = f.properties?.mag
    if (mag == null) return
    
    if (mag < 4.0) dist['3.0-4.0']++
    else if (mag < 5.0) dist['4.0-5.0']++
    else if (mag < 6.0) dist['5.0-6.0']++
    else if (mag < 7.0) dist['6.0-7.0']++
    else dist['7.0+']++
  })
  
  return dist
}

/**
 * 渲染图表
 */
function renderChart() {
  if (!chartRef.value) return
  
  const distribution = calculateMagDistribution(props.features)
  
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
          '#0ea5e9', // < 4.0 蓝色
          '#22c55e', // 4-5 绿色
          '#eab308', // 5-6 黄色
          '#f97316', // 6-7 橙色
          '#ef4444'  // 7+ 红色
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
