# Earthquake Agent Vue3 前端

基于 Vue3 + Element Plus + Tailwind CSS 的地震查询分析平台前端。

## 技术栈

- **框架**: Vue 3.4 + Composition API
- **构建工具**: Vite 5
- **UI组件库**: Element Plus 2.5
- **样式**: Tailwind CSS 3.4
- **状态管理**: Pinia 2
- **地图**: Leaflet 1.9 + leaflet.heat
- **图表**: Chart.js 4.4
- **HTTP**: Axios 1.6

## 功能特性

### 核心功能
- 自然语言查询地震数据
- 交互式地图展示（高德/卫星/深色底图）
- 热力图与标记点切换
- 震级与深度分布统计图表
- AI 智能分析对话
- 数据导出（CSV/GeoJSON）
- 二次筛选（震级/深度范围）

### 优化特性
- 响应式设计
- 防抖节流优化
- 组件级状态管理
- 自动内存清理
- 流式响应显示

## 快速开始

### 安装依赖

```bash
cd web
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 生产构建

```bash
npm run build
```

## 项目结构

```
src/
├── components/          # UI组件
│   ├── SearchBar.vue   # 搜索栏
│   ├── MapContainer.vue # 地图容器
│   ├── InfoPanel.vue   # 信息面板
│   ├── ChatSidebar.vue # 聊天侧边栏
│   ├── MagChart.vue    # 震级图表
│   ├── DepthChart.vue  # 深度图表
│   ├── QuakeList.vue   # 地震列表
│   ├── FilterPanel.vue # 筛选面板
│   └── MissionControl.vue # 工具栏
├── stores/             # Pinia状态管理
│   ├── earthquake.js   # 地震数据
│   ├── chat.js         # 聊天状态
│   └── filter.js       # 筛选状态
├── composables/        # 可复用逻辑
│   └── useExport.js    # 导出功能
├── utils/              # 工具函数
│   └── throttle.js     # 节流防抖
├── api/                # API请求
│   └── index.js        # 接口封装
└── styles/             # 全局样式
    └── index.css       # Tailwind导入
```

## 后端接口

后端服务需运行在 http://127.0.0.1:8000

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/nl-query | POST | 地震数据查询 |
| /api/chat | POST | AI对话（流式） |
| /health | GET | 健康检查 |

## 配置

### Vite代理（vite.config.js）

```javascript
server: {
  proxy: {
    '/api': 'http://127.0.0.1:8000'
  }
}
```

### Tailwind主题（tailwind.config.js）

```javascript
theme: {
  extend: {
    colors: {
      primary: '#409EFF'
    }
  }
}
```

## 浏览器支持

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## 许可证

MIT
