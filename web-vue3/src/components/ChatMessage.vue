<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CopyDocument } from '@element-plus/icons-vue'

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
/* Markdown样式覆盖 */
.prose :deep(p) {
  margin: 0.5em 0;
}

.prose :deep(ul), .prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.prose :deep(li) {
  margin: 0.25em 0;
}

.prose :deep(code) {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.prose :deep(pre) {
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.prose :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: inherit;
}

.prose :deep(h1), .prose :deep(h2), .prose :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
}

.prose :deep(strong) {
  font-weight: 600;
}

.prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
}

.prose :deep(th), .prose :deep(td) {
  border: 1px solid #ddd;
  padding: 0.4em 0.8em;
  text-align: left;
}

.prose :deep(th) {
  background-color: #f5f5f5;
  font-weight: 600;
}

/* 用户消息中的链接样式 */
.bg-blue-500 :deep(a) {
  color: #e0f2fe;
  text-decoration: underline;
}

.bg-blue-500 :deep(a:hover) {
  color: #ffffff;
}
</style>
