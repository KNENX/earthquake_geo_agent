import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 聊天状态管理
 */
export const useChatStore = defineStore('chat', () => {
  // ========== State ==========
  const messages = ref([])           // 消息历史
  const loading = ref(false)         // 加载状态
  const streaming = ref(false)       // 流式响应中
  const currentStream = ref('')      // 当前流式内容

  // ========== Getters ==========
  const hasMessages = computed(() => messages.value.length > 0)
  const lastMessage = computed(() => messages.value[messages.value.length - 1])

  // ========== Actions ==========
  /**
   * 添加用户消息
   * @param {string} content - 消息内容
   */
  function addUserMessage(content) {
    messages.value.push({
      role: 'user',
      content,
      timestamp: Date.now()
    })
  }

  /**
   * 添加助手消息（完整）
   * @param {string} content - 消息内容
   */
  function addAssistantMessage(content) {
    messages.value.push({
      role: 'assistant',
      content,
      timestamp: Date.now()
    })
  }

  /**
   * 开始流式响应
   */
  function startStreaming() {
    streaming.value = true
    currentStream.value = ''
  }

  /**
   * 追加流式内容
   * @param {string} chunk - 内容片段
   */
  function appendStream(chunk) {
    currentStream.value += chunk
  }

  /**
   * 结束流式响应
   */
  function endStreaming() {
    if (currentStream.value) {
      addAssistantMessage(currentStream.value)
    }
    streaming.value = false
    currentStream.value = ''
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    messages.value = []
    currentStream.value = ''
    streaming.value = false
  }

  /**
   * 获取用于API的消息格式
   */
  const formattedMessages = computed(() => {
    return messages.value.map(m => ({
      role: m.role,
      content: m.content
    }))
  })

  return {
    // State
    messages,
    loading,
    streaming,
    currentStream,
    // Getters
    hasMessages,
    lastMessage,
    formattedMessages,
    // Actions
    addUserMessage,
    addAssistantMessage,
    startStreaming,
    appendStream,
    endStreaming,
    clearMessages
  }
})
