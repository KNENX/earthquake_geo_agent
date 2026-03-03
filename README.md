# 🌍 Earthquake Command | AI Agent

> 基于AI的全球地震数据可视化平台 - 专业的科学仪表盘

![Python](https://img.shields.io/badge/python-3.8+-yellow)
![Version](https://img.shields.io/badge/version-v5.1-blue)

---

## 📋 项目概述

**Earthquake Command** 是一个基于AI的地震数据分析与可视化平台，结合自然语言处理、地理信息系统和现代Web技术，为用户提供专业的地震数据查询和分析体验。

### 核心特性

- 🤖 **智能自然语言查询** - 用中文查询全球地震数据
- 🗺️ **交互式地图可视化** - 多种底图、热力图、标记点
- 📊 **实时数据统计** - 震级分布、深度分布图表分析
- 💬 **AI知识助手** - 多轮对话咨询地震专业知识
- 🎯 **精准区域识别** - 支持中国城市/省份、全球国家查询
- 📥 **数据导出** - CSV、GeoJSON格式导出
- 🎨 **专业UI设计** - 深色命令模式，玻璃态磨砂效果

---

## 🚀 最近更新 (v5.1)

### ✨ 新增特性与交互优化

- 🎚️ **二次筛选面板**：全新引入玻璃态下拉过滤面板，支持使用双滑块对当前地震数据的震级和深度进行二次范围筛选。
- 💾 **AI 记忆存储**：AI 对话现已支持本地持久化存储（Local Storage），刷新网页不丢失对话历史，并提供一键清空功能。
- 🗺️ **地图底图升级**：引入高德地图（Light模式）作为默认底图解决国内网络加载问题，并修复了图层切换的逻辑错误。
- 🎨 **视觉细节对齐**：统一了环形图、地图数据点、弹出层等元素的颜色规范，深度数据展示更加直观清晰。
- ⚡ **核心逻辑优化**：完善了 Python API 对于无精确时间查询时的逻辑处理，提升了后台查询的稳定性。

---

## 🚀 v5.0 重大变化

### 🎨 UI/UX 完全重构

- ✨ **深色命令模式**：从传统亮色界面升级为专业仪表盘
- 🌟 **玻璃态设计**：引入Glassmorphism设计语言
- 🎯 **CSS变量系统**：完整的设计令牌系统
- 📱 **现代字体**：Inter（UI）+ JetBrains Mono（数据）
- 🎮 **Mission Control**：右下角悬浮工具栏

### 🏗️ 技术优化

- ❌ 移除npm包依赖，改用CDN直连加载
- ✅ 利用浏览器缓存，加速首次加载
- ⚡ 后端API保持不变，完全兼容

---

## 🏗️ 技术架构

### 技术栈

**前端**
- JavaScript ES6+ | Vite 7.2.4
- Leaflet 1.9.4 | Chart.js 4.5.1
- Inter + JetBrains Mono 字体
- 所有库通过CDN加载

**后端**
- Python 3.8+ | FastAPI 0.115.6
- geoPandas 1.1.0+ | shapely 2.1.0+
- pydantic 2.0.0+ | httpx 0.27.2

**LLM提供商**
- **SiliconFlow** - Qwen 2.5-7B（自然语言查询）
- **NVIDIA** - DeepSeek V3.2（AI知识问答）

**数据源**
- USGS Earthquake API - 实时地震数据
- GADM v4.1 - 全球行政区划
- Natural Earth - 国家边界数据

---

## ⚡ 快速开始

### 环境要求

- Python 3.8+
- Node.js 18+（仅开发用）
- Windows PowerShell / macOS / Linux

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd earthquake_agent
```

#### 2. 配置环境变量

创建 `api/.env` 文件：

```env
# Query Model (SiliconFlow)
QUERY_API_KEY=your_siliconflow_api_key
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

# Chat Model (NVIDIA)
CHAT_API_KEY=your_nvidia_api_key
CHAT_BASE_URL=https://integrate.api.nvidia.com/v1
CHAT_MODEL=deepseek-ai/deepseek-v3.2
```

> **获取API密钥**：
> - SiliconFlow: https://cloud.siliconflow.cn/
> - NVIDIA NIM: https://build.nvidia.com/

#### 3. 安装后端依赖

```bash
cd api
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

#### 4. 下载地理数据（推荐）

将以下文件放到 `api/boundaries/`：
- **gadm41_CHN.gpkg** (76MB) - [GADM](https://gadm.org/download_country_v4.html) 选择中国GeoPackage格式
- **ne_10m_admin_0_countries.shp** - [Natural Earth 10m](https://www.naturalearthdata.com/downloads/) 解压到 `natural_earth/`
- **regions.json** - 创建文件添加区域配置（示例见[项目结构](#项目结构)）

#### 5. 启动服务

**Windows（PowerShell）：**
```powershell
.\scripts\start.ps1
```

**macOS/Linux：**
```bash
# 手动启动
cd api && uvicorn main:app --port 8000 --reload &
cd web && npm run dev
```

#### 6. 访问应用

- **前端界面**: http://localhost:5173/
- **后端文档**: http://127.0.0.1:8000/docs
- **健康检查**: http://127.0.0.1:8000/health

### 管理命令

```powershell
.\scripts\status.ps1  # 查看状态
.\scripts\stop.ps1    # 停止服务
```

---

## 🎯 功能介绍

### 1. 自然语言查询

**简单查询：**
```text
过去7天全球的地震
今天的日本地震
过去24小时台湾的6级以上地震
```

**复杂查询：**
```text
2011年3月日本东北海域的所有地震
过去一年新西兰南岛附近的深源地震（>300km）
常州市过去10年的所有地震
```

### 2. AI知识问答

点击右下角聊天图标，与AI助手对话：
- "地震是怎么形成的？"
- "里氏震级和矩震级有什么区别？"
- "为什么环太平洋地震带地震频繁？"
- **历史记录**：自动保存聊天记录到本地，刷新网页不丢失，随时接续对话。

### 3. 地图可视化

- **多种底图**：深色命令模式、卫星影像、浅色模式
- **标记点**：按震级大小和颜色显示
- **热力图**：切换查看地震密度分布
- **弹出信息**：点击标记点查看详细信息

### 4. 数据统计

左侧数据面板显示：
- 监测数量、最大震级
- 震级分布、深度概况图表
- AI解析的查询参数
- 所有地震详细列表

### 5. 数据二次筛选 (新)

点击顶部搜索框旁边的漏斗图标唤出二次筛选面板：
- 可拖动双节点滑块直观选定区域内的**震级范围**与**深度区间**
- 即时过滤并显示当前符合条件的数据统计情况

### 6. 数据导出

支持导出CSV（Excel兼容）和GeoJSON（GIS标准）格式。

---

## ⚙️ 配置说明

### 后端配置（api/.env）

```env
# LLM配置
QUERY_API_KEY=<必须配置>
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

CHAT_API_KEY=<必须配置>
CHAT_BASE_URL=https://integrate.api.nvidia.com/v1
CHAT_MODEL=deepseek-ai/deepseek-v3.2
```

### 前端配置（web/src/main.js）

```javascript
// 第5行：后端地址
const BACKEND_BASE = "http://127.0.0.1:8000";
```

### 缓存配置

- USGS数据缓存：5分钟TTL
- LLM计划缓存：5分钟TTL

---

## 📁 项目结构

```
earthquake_agent/
├── api/                          # 后端API
│   ├── main.py                   # 主程序 (1207行)
│   ├── requirements.txt          # Python依赖
│   ├── .env                      # 环境变量（不提交Git）
│   ├── boundaries/               # 地理边界数据
│   │   ├── gadm41_CHN.gpkg       # 中国省市 (76MB)
│   │   ├── natural_earth/        # 国家边界
│   │   │   └── ne_10m_admin_0_countries.shp
│   │   └── regions.json          # 特殊区域配置
│   └── logs/                     # 查询日志
│       └── queries.jsonl
│
├── web/                          # 前端应用
│   ├── src/
│   │   ├── main.js               # 主逻辑 (1385行)
│   │   └── style.css             # 样式 (1025行)
│   ├── index.html                # HTML模板 (218行)
│   └── package.json              # npm配置
│
├── scripts/                      # 运维脚本
│   ├── start.ps1                 # 启动服务
│   ├── status.ps1                # 查看状态
│   ├── stop.ps1                  # 停止服务
│   └── pids/                     # 进程ID和日志
│
└── README.md                     # 本文件
```

### regions.json 示例

```json
{
  "regions": {
    "全球": {
      "name_en": "Global",
      "bbox": [-180, -90, 180, 90],
      "aliases": ["global", "世界", "地球"]
    },
    "亚洲": {
      "name_en": "Asia",
      "bbox": [26.0, -11.0, 169.0, 81.0],
      "aliases": ["asia", "Asian"]
    },
    "北美洲": {
      "name_en": "North America",
      "bbox": [-170.0, 15.0, -50.0, 85.0],
      "aliases": ["north america"]
    }
  }
}
```

---

## 🎨 设计系统

### CSS变量

**核心背景**
```css
--bg-deep: #0b0d11;        /* 深空背景 */
--bg-ground: #151922;      /* 地面背景 */
```

**磨砂玻璃**
```css
--glass-panel: rgba(20, 25, 35, 0.75);
--glass-border: 1px solid rgba(255, 255, 255, 0.08);
--glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.45);
--backdrop-blur: blur(12px);
```

**强调色**
```css
--accent-primary: #7c3aed;     /* Violet 600 */
--accent-secondary: #0ea5e9;   /* Sky 500 */
```

**震级警示色**
```css
--mag-extreme: #ef4444;        /* 红色：≥7级 */
--mag-high: #f97316;           /* 橙色：6-7级 */
--mag-medium: #eab308;         /* 黄色：5-6级 */
--mag-low: #22c55e;            /* 绿色：4-5级 */
```

**字体**
```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

---

## ❓ 常见问题

### Q1: 聊天功能返回502错误？

**检查API密钥配置**：
```powershell
# 查看500行最近的错误日志
Get-Content .\scripts\pids\api.err.log -Tail 50
```

确保 `api/.env` 中的 `CHAT_API_KEY` 正确有效。

### Q2: 前端无法连接到后端？

```powershell
# 1. 确认后端运行
.\scripts\status.ps1

# 2. 测试健康检查
curl http://127.0.0.1:8000/health

# 3. 检查前端配置
# web/src/main.js 第5行应为：
BACKEND_BASE = "http://127.0.0.1:8000"
```

### Q3: 地理数据未加载？

确认 `api/boundaries/` 目录包含：
- `gadm41_CHN.gpkg` (76MB)
- `natural_earth/ne_10m_admin_0_countries.shp`
- `regions.json`

查看后端启动日志中的 `[GEO]` 信息。

### Q4: 热力图不可见？

编辑 `web/src/main.js` 第100行调整强度：
```javascript
const intensity = Math.max(0.3, mag / 7.0);  // 降低分母增加强度
```

### Q5: 浏览器不支持效果？

**兼容性**：
- Chrome 76+, Safari 9+, Firefox 103+, Edge 79+

不支持 `backdrop-filter` 时会显示普通背景色。

---

## 🔗 相关资源

### 官方文档

- [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [SiliconFlow API](https://docs.siliconflow.cn/)
- [NVIDIA NIM API](https://build.nvidia.com/)
- [Leaflet 文档](https://leafletjs.com/)
- [Chart.js 文档](https://www.chartjs.org/)

### 地理数据

- [GADM 下载](https://gadm.org/download_world.html)
- [Natural Earth 下载](https://www.naturalearthdata.com/downloads/)

---

## 📝 开发路线图

### v5.1 (当前) ✅
- [x] 新增二次筛选面板（震级和深度双滑块过滤）
- [x] AI 助手增加本地对话历史记忆与清除功能
- [x] 优化地图图层切换逻辑并设置高德地图为默认底图
- [x] 修复图表颜色渲染并完善时间筛选逻辑算法

### v5.0 ✅
- [x] UI/UX完全重构
- [x] 深色命令模式
- [x] 玻璃态设计系统
- [x] Mission Control工具栏
- [x] CDN依赖加载

### v5.2 (计划中)
- [ ] 移动端响应式优化
- [ ] 浏览器兼容性回退
- [ ] 性能监控
- [ ] 单元测试

### v6.0 (未来)
- [ ] 3D可视化
- [ ] 离线PWA支持
- [ ] Docker部署

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

---

## 🙏 致谢

- [USGS](https://www.usgs.gov/) - 全球地震实时数据
- [GADM](https://gadm.org/) - 全球行政区划数据
- [Natural Earth](https://www.naturalearthdata.com/) - 高质量地图数据
- [SiliconFlow](https://siliconflow.cn/) - Qwen LLM服务
- [NVIDIA](https://www.nvidia.com/) - DeepSeek LLM服务
- [Leaflet](https://leafletjs.com/) - 开源地图库
- [Chart.js](https://www.chartjs.org/) - 开源图表库

---

<div align="center">

**Built with ❤️ for earthquake awareness**

</div>
