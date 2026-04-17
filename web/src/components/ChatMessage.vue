<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  role: {
    type: String,
    required: true,
    validator: (value) => ['user', 'assistant'].includes(value)
  },
  content: {
    type: String,
    default: ''
  },
  streaming: {
    type: Boolean,
    default: false
  }
})

/**
 * 是否是用户消息
 */
const isUser = computed(() => props.role === 'user')

/**
 * 渲染Markdown内容
 */
const renderedContent = computed(() => {
  if (!props.content) return ''
  
  // 使用marked解析Markdown
  const rawHtml = marked.parse(props.content, {
    breaks: true,
    gfm: true
  })
  
  // 使用DOMPurify过滤XSS
  return DOMPurify.sanitize(rawHtml)
})

/**
 * 复制内容到剪贴板
 */
async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.content)
    ElMessage.success('已复制到剪贴板')
  } catch (err) {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div
    class="flex gap-3"
    :class="isUser ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- 头像 -->
    <div
      class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
      :class="isUser ? 'bg-blue-500' : 'bg-green-500'"
    >
      {{ isUser ? '我' : 'AI' }}
    </div>
    
    <!-- 消息内容 -->
    <div
      class="max-w-[80%] rounded-lg px-4 py-2 relative group"
      :class="isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'"
    >
      <!-- Markdown内容（AI消息） -->
      <div
        v-if="!isUser"
        class="prose prose-sm max-w-none"
        :class="{ 'animate-pulse': streaming }"
        v-html="renderedContent"
      />
      
      <!-- 纯文本（用户消息） -->
      <div
        v-else
        class="whitespace-pre-wrap"
      >
        {{ content }}
      </div>
      
      <!-- 复制按钮（AI消息） -->
      <button
        v-if="!isUser && !streaming"
        class="absolute -right-8 top-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200"
        @click="copyContent"
        title="复制内容"
      >
        <el-icon><CopyDocument /></el-icon>
      </button>
      
      <!-- 加载动画（流式中） -->
      <div
        v-if="streaming && content"
        class="inline-flex gap-1 mt-2"
      >
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0s"/>
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"/>
        <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 用户消息中的链接样式 */
.bg-blue-500 :deep(a) {
  color: #e0f2fe;
  text-decoration: underline;
}

.bg-blue-500 :deep(a:hover) {
  color: #ffffff;
}
</style>
