<script setup>
import { ref, nextTick, watch } from 'vue'
import { ChatDotRound, Delete, VideoPause } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useEarthquakeStore } from '@/stores/earthquake'
import { useChatStore } from '@/stores/chat'
import { sendChatMessage } from '@/api'
import ChatMessage from './ChatMessage.vue'

const earthquakeStore = useEarthquakeStore()
const chatStore = useChatStore()
const visible = ref(false)  // 侧边栏显示
const message = ref('')       // 输入消息
const messagesContainer = ref(null)  // 消息容器
const isAutoScroll = ref(true)       // 是否允许自动滚到底部
const abortController = ref(null)    // 用于中止流式请求的控制器

// 快捷提问列表
const quickQuestions = [
  '请总结本次查询的整体情况',
  '列出本次受影响最严重的地区',
  '帮我分析一下这次的震级分布',
  '这次地震活动有什么规律？',
  '这些地震的分布有什么特点？'
]

/**
 * 监听滚动事件，判断用户是否有上翻阅读意图
 */
function handleScroll(e) {
  const el = e.target
  if (!el) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  isAutoScroll.value = distanceToBottom < 80 // 给 80 像素的宽容度，防止误触
}

/**
 * 发送消息
 */
async function sendMessage() {
  if (!message.value.trim()) return

  const userMessage = message.value.trim()
  chatStore.addUserMessage(userMessage)
  message.value = ''
  scrollToBottom(true) // 主动发送总是强制到底

  // 开始流式响应
  await handleStreamResponse(userMessage)
}

/**
 * 处理流式响应
 */
async function handleStreamResponse(userMessage) {
  chatStore.startStreaming()
  chatStore.loading = true

  // 每次发起新对话前，实例化一个新的请求控制器
  abortController.value = new AbortController()

  try {
    // 构建上下文消息
    const messages = buildContextMessages(userMessage)

    // 发送请求，带上信号量约束
    const response = await sendChatMessage(messages, abortController.value.signal)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || '请求失败，服务器异常')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataText = line.substring(6)
          if (dataText === '[DONE]') continue

          try {
            const data = JSON.parse(dataText)
            const content = data.choices?.[0]?.delta?.content || ''
            if (content) {
              chatStore.appendStream(content)
              scrollToBottom()
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    chatStore.endStreaming()
  } catch (err) {
    if (err.name === 'AbortError') {
      ElMessage.info('已停止生成')
    } else {
      ElMessage.error('聊天请求失败：' + err.message)
    }
    chatStore.endStreaming()
  } finally {
    chatStore.loading = false
    abortController.value = null
    scrollToBottom()
  }
}

/**
 * 构建上下文消息
 */
function buildContextMessages(userMessage) {
  const messages = []

  // 如果有地震数据，添加精确的上下文
  if (earthquakeStore.hasData) {
    const stats = earthquakeStore.stats
    const params = earthquakeStore.usgsParams
    const topFeatures = stats?.top_50 || []

    // 从实际 USGS 请求参数中提取精确的时间范围
    const starttime = params?.starttime || '未知'
    const endtime = params?.endtime || '未知'

    let context = `【当前查询的地震数据背景】\n`
    context += `用户原始查询：${earthquakeStore.lastQuery || '未知'}\n`
    context += `实际查询时间范围：${starttime} 至 ${endtime}\n`
    context += `数据统计：共 ${earthquakeStore.count} 次地震\n`
    context += `最大震级：${stats?.max_magnitude || '-'}\n`
    context += `平均震级：${stats?.avg_magnitude?.toFixed(2) || '-'}\n`
    
    if (stats?.dist_mag) {
      context += `震级分布统计：${JSON.stringify(stats.dist_mag)}\n`
    }
    if (stats?.dist_region) {
      context += `全量地震地域频次普查(宏观聚类)：${JSON.stringify(stats.dist_region)}\n`
    }
    context += `\n`

    if (topFeatures.length) {
      context += `【Top ${topFeatures.length} 强烈地震】\n`
      topFeatures.forEach((f, i) => {
        context += `${i + 1}. ${f.place} | 震级:${f.mag} | 深度:${f.depth}km | 时间:${f.time_str}\n`
      })
    }

    context += `\n【用户问题】${userMessage}`

    messages.push({ role: 'user', content: context })
  } else {
    messages.push({ role: 'user', content: userMessage })
  }

  // 添加历史消息（限制长度）
  const history = chatStore.formattedMessages.slice(-10)
  return [...history, ...messages]
}

/**
 * 发送消息
 */
function quickAsk(text) {
  message.value = text
  sendMessage()
}

/**
 * 手动中止生成
 */
function stopGeneration() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
}

/**
 * 清空对话
 */
function clearChat() {
  chatStore.clearMessages()
}

/**
 * 滚动到底部
 */
function scrollToBottom(force = false) {
  nextTick(() => {
    if (messagesContainer.value) {
      if (isAutoScroll.value || force === true) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    }
  })
}

// 监听新消息自动滚动
watch(() => chatStore.messages.length, scrollToBottom)
</script>

<template>
  <div>
    <!-- 聊天按钮 -->
    <el-button
      circle
      size="large"
      class="shadow-lg"
      title="AI对话"
      @click="visible = true"
    >
      <el-icon :size="20"><ChatDotRound /></el-icon>
    </el-button>

    <!-- 侧边栏 -->
    <el-drawer
      v-model="visible"
      title="AI 地震助手"
      direction="rtl"
      size="450px"
      append-to-body
    >
      <div class="flex flex-col h-full">
        <!-- 消息区域 -->
        <div
          ref="messagesContainer"
          class="flex-1 overflow-y-auto p-4 space-y-4"
          @scroll="handleScroll"
        >
          <!-- 欢迎消息 -->
          <div class="bg-gray-100 rounded-lg p-3 text-sm">
            你好！我是地震知识助手，可以帮你分析地震数据或回答相关问题。
          </div>

          <!-- 消息列表 -->
          <ChatMessage
            v-for="(msg, index) in chatStore.messages"
            :key="index"
            :role="msg.role"
            :content="msg.content"
          />

          <!-- 流式消息 -->
          <ChatMessage
            v-if="chatStore.streaming"
            role="assistant"
            :content="chatStore.currentStream"
            :streaming="true"
          />

          <!-- 提示先查询 -->
          <div v-if="!earthquakeStore.hasData && !chatStore.hasMessages" class="text-center text-gray-400 py-8">
            请先查询地震数据，我可以帮你分析结果
          </div>
        </div>

        <!-- 快捷问题 -->
        <div v-if="earthquakeStore.hasData" class="p-4 border-t">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-gray-400">快捷提问</span>
            <el-button
              v-if="chatStore.hasMessages"
              text
              size="small"
              @click="clearChat"
            >
              <el-icon class="mr-1"><Delete /></el-icon>
              清空
            </el-button>
          </div>
          <div class="flex flex-wrap gap-2">
            <el-tag
              v-for="q in quickQuestions"
              :key="q"
              class="cursor-pointer hover:bg-blue-100"
              size="small"
              @click="quickAsk(q)"
            >
              {{ q }}
            </el-tag>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="p-4 border-t">
          <el-input
            v-model="message"
            type="textarea"
            :rows="2"
            placeholder="输入问题，分析当前查询的地震数据..."
            :disabled="chatStore.loading"
            @keyup.enter.prevent="sendMessage"
          />
          <div class="flex gap-2 mt-2">
            <el-button
              v-if="chatStore.loading"
              type="danger"
              plain
              class="flex-1"
              @click="stopGeneration"
            >
              <el-icon class="mr-1"><VideoPause /></el-icon>
              中止输出
            </el-button>
            <el-button
              v-else
              type="primary"
              class="w-full"
              :disabled="!message.trim()"
              @click="sendMessage"
            >
              发送
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
