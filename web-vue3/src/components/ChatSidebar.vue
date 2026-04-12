<script setup>
import { ref, computed } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import { useEarthquakeStore } from '@/stores/earthquake'

const store = useEarthquakeStore()
const visible = ref(false)  // 侧边栏显示
const message = ref('')       // 输入消息

/**
 * 发送消息（占位）
 */
function sendMessage() {
  if (!message.value.trim()) return
  // TODO: 实现聊天功能
  message.value = ''
}

/**
 * 快捷提问
 */
function quickAsk(text) {
  message.value = text
  sendMessage()
}

/**
 * 示例快捷问题
 */
const quickQuestions = [
  '请总结本次查询的整体情况',
  '列出本次受影响最严重的地区',
  '帮我分析一下这次的震级分布'
]
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
      size="400px"
    >
      <div class="flex flex-col h-full">
        <!-- 消息区域 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- 欢迎消息 -->
          <div class="bg-gray-100 rounded-lg p-3 text-sm">
            你好！我是地震知识助手，可以帮你分析地震数据或回答相关问题。
          </div>

          <!-- 提示先查询 -->
          <div v-if="!store.hasData" class="text-center text-gray-400 py-8">
            请先查询地震数据，我可以帮你分析结果
          </div>
        </div>

        <!-- 快捷问题 -->
        <div v-if="store.hasData" class="p-4 border-t">
          <div class="text-xs text-gray-400 mb-2">快捷提问</div>
          <div class="flex flex-wrap gap-2">
            <el-tag
              v-for="q in quickQuestions"
              :key="q"
              class="cursor-pointer"
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
            placeholder="输入问题..."
            @keyup.enter="sendMessage"
          />
          <el-button
            type="primary"
            class="mt-2 w-full"
            @click="sendMessage"
          >
            发送
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
