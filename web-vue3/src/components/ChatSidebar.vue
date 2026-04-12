<script setup>
import { ref, nextTick, watch } from 'vue'
import { ChatDotRound, Delete } from '@element-plus/icons-vue'
import { useEarthquakeStore } from '@/stores/earthquake'
import { useChatStore } from '@/stores/chat'
import { sendChatMessage } from '@/api'
import ChatMessage from './ChatMessage.vue'

const earthquakeStore = useEarthquakeStore()
const chatStore = useChatStore()
const visible = ref(false)  // 侧边栏显示
const message = ref('')       // 输入消息
const messagesContainer = ref(null)  // 消息容器

// 快捷提问列表
const quickQuestions = [
  '请总结本次查询的整体情况',
  '列出本次受影响最严重的地区',
  '帮我分析一下这次的震级分布',
  '这次地震活动有什么规律？',
  '这些地震的分布有什么特点？'
]

/**
 * 发送消息
 */
async function sendMessage() {
  if (!message.value.trim()) return

  const userMessage = message.value.trim()
  chatStore.addUserMessage(userMessage)
  message.value = ''
  scrollToBottom()

  // 开始流式响应
  await handleStreamResponse(userMessage)
}

/**
 * 处理流式响应
 */
async function handleStreamResponse(userMessage) {
  chatStore.startStreaming()
  chatStore.loading = true

  try {
    // 构建上下文消息
    const messages = buildContextMessages(userMessage)

    // 发送请求
    const response = await sendChatMessage(messages)

    if (!response.ok) {
      throw new Error('请求失败')
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
    ElMessage.error('聊天请求失败：' + err.message)
    chatStore.endStreaming()
  } finally {
    chatStore.loading = false
    scrollToBottom()
  }
}

/**
 * 构建上下文消息
 */
function buildContextMessages(userMessage) {
  const messages = []

  // 如果有地震数据，添加上下文
  if (earthquakeStore.hasData) {
    const stats = earthquakeStore.stats
    const topFeatures = [...earthquakeStore.features]
      .sort((a, b) => (b.properties?.mag || 0) - (a.properties?.mag || 0))
      .slice(0, 10)

    let context = `【当前查询的地震数据背景】\n`
    context += `查询范围：${earthquakeStore.currentPlan?.starttime || '过去7天'}\n`
    context += `数据统计：共 ${earthquakeStore.count} 次地震\n`
    context += `最大震级：${stats?.max_magnitude || '-'}\n`
    context += `平均震级：${stats?.avg_magnitude?.toFixed(2) || '-'}\n\n`

    if (topFeatures.length) {
      context += `【Top ${topFeatures.length} 地震】\n`
      topFeatures.forEach((f, i) => {
        const p = f.properties || {}
        context += `${i + 1}. ${p.place} | 震级:${p.mag} | 时间:${new Date(p.time).toLocaleString()}\n`
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
 * 快捷提问
 */
function quickAsk(text) {
  message.value = text
  sendMessage()
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
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
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
    >
      <div class="flex flex-col h-full">
        <!-- 消息区域 -->
        <div
          ref="messagesContainer"
          class="flex-1 overflow-y-auto p-4 space-y-4"
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
          <el-button
            type="primary"
            class="mt-2 w-full"
            :loading="chatStore.loading"
            :disabled="!message.trim()"
            @click="sendMessage"
          >
            {{ chatStore.loading ? '思考中...' : '发送' }}
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
