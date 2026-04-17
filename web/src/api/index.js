import axios from 'axios'

/**
 * Axios 实例配置
 */
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * 请求拦截器
 */
api.interceptors.request.use(
  config => {
    // 可以在这里添加 token 或其他请求头
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 */
api.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.detail || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

/**
 * 查询地震数据
 * @param {string} query - 查询语句
 * @returns {Promise} - 返回地震数据
 */
export function fetchEarthquakeData(query) {
  return api.post('/nl-query', { query })
}

/**
 * 发送聊天消息（流式）
 * @param {Array} messages - 消息历史
 * @param {AbortSignal} [signal] - 用于中止请求的信号
 * @returns {Promise<Response>} - 返回流式响应
 */
export function sendChatMessage(messages, signal) {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal
  })
}

/**
 * 健康检查
 * @returns {Promise} - 返回状态
 */
export function checkHealth() {
  return api.get('/health')
}

export default api
