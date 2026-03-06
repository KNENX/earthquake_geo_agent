# 🌍 地震指令 | AI 助手

一个基于人工智能的全球地震数据分析与可视化平台

[![Python](https://img.shields.io/badge/python-3.8+-yellow)
![FastAPI](https://img.shields.io/badge/fastapi-0.115.6+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-5.1.0-orange)

> 让查询地震数据像对话一样简单

---

## 📋 项目简介

**地震指令 | AI 助手** 是一个功能强大的地震数据分析平台，通过自然语言处理技术，让你可以用日常语言查询全球地震数据，并提供专业的可视化展示和AI智能分析功能。

### 核心特性

- 🗣️ **智能自然语言查询** - 用中文查询地震数据，无需专业术语
- 🗺️ **交互式地图展示** - 支持多种地图底图、热力图、统计图表
- 📊 **实时数据统计** - 自动分析震级分布、深度分布
- 🤖 **AI 对话助手** - 基于DeepSeek的地震知识咨询
- 🎯 **精准区域识别** - 支持中国城市、省份、国家多层级查询
- 📥 **数据导出功能** - 一键导出CSV和GeoJSON格式
- 🎨 **现代化UI设计** - 玻璃态界面，深色主题，专业仪表盘风格

---

## 🚀 主要功能

### 1. 自然语言查询

用大白话查询地震，系统自动解析你的意图：

**简单示例**：
```
"过去7天全球所有的地震"
"今天是哪些地方发生了5级以上的地震"
"日本过去一个月的地震"
"四川省最近半年的大地震"
```

**复杂查询**：
```
"2011年3月日本东北海域发生的所有地震"
"过去一年新西兰附近的深源地震（超过300公里）"
"环太平洋带上周发生的6级以上浅源地震"
```

### 2. 多维度筛选

查询后还可以二次筛选：

- **时间范围**：相对时间（过去7天）或绝对时间（2024年1月-3月）
- **地理区域**：
  - 全球、大洲（亚洲、欧洲等）
  - 国家（日本、新西兰等258个国家）
  - 中国省份（四川省、台湾省等37个）
  - 中国城市（北京市、上海市等368个城市）
- **震级范围**：支持数值（5.0-7.0）或描述（大地震、强震）
- **深度范围**：浅源（<70km）、中源（70-300km）、深源（>300km）

### 3. 地图可视化

**三种地图底图**：
- 📍 **标准模式（高德地图）**：国内访问速度快，无需VPN
- 🌙 **命令模式（深色主题）**：适合数据分析，护眼专业
- 🛰️ **卫星视图（Esri）**：视觉冲击力强，适合演示汇报

**地图功能**：
- 地震点标记（按震级大小和颜色区分）
- 热力图模式（密度可视化）
- 三种缩放控制方式（鼠标滚轮、界面按钮、键盘快捷键）
- 点击标记查看详细信息（震级、地点、深度、时间、USGS链接）

### 4. 数据统计图表

**震级分布环图**：
- < 4.0（蓝色）
- 4.0-5.0（绿色）
- 5.0-6.0（黄色）
- 6.0-7.0（橙色）
- ≥ 7.0（红色）

**深度分布图**：
- 浅源（0-70km）
- 中源（70-300km）
- 深源（>300km）

### 5. AI 智能对话

右侧聊天面板的AI助手可以帮你：

**数据分析类**：
- "总结本次查询的整体情况"
- "列出这次受影响最严重的地区"
- "分析这次的震级分布特点"
- "对比不同时间段的地震活动"

**知识问答类**：
- "地震是怎么形成的？"
- "里氏震级和矩震级有什么区别？"
- "为什么环太平洋地震带地震频繁？"
- "发生地震时应该怎么避险？"

**实时流式响应**：AI回答实时显示，带Markdown格式和代码高亮

### 6. 二次筛选

顶部搜索栏右侧的筛选按钮可以打开过滤面板：

- **震级范围滑块**：0.0 - 10.0，实时显示筛选结果数量
- **深度范围滑块**：0 - 700km，实时更新
- **一键重置**：快速恢复所有数据

### 7. 数据导出

右下角导出按钮支持：
- **CSV格式**：Excel可直接打开，包含完整字段（时间、地点、震级、深度、经纬度、USGS详情链接）
- **GeoJSON格式**：GIS软件标准格式（QGIS、ArcGIS、web地图应用）

文件命名：`earthquakes_YYYY-MM-DDTHH-MM-SSZ.csv` 或 `.geojson`

---

## 🏗️ 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户界面（浏览器）                      │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐ │
│  │   搜索栏       │  │   地图容器     │  │  数据面板      │ │
│  │   + 筛选面板   │  │   + 图层切换    │  │  + 统计图表    │ │
│  └───────┬───────┘  └───────┬───────┘  └────┬───────────┘ │
│          │                  │              │             │
└──────────┼──────────────────┼──────────────┼─────────────┘
           │                  │              │
           ↓                  ↓              ↓
    ┌──────────┐      ┌──────────┐   ┌──────────┐
    │ 前端逻辑  │      │  地图组件  │   │  图表组件  │
    │ (JS1704行) │      │ (Leaflet)  │   │ (Chart.js) │
    └──────────┘      └──────────┘   └──────────┘
           │                  │
           └──────────────────┴──────────→ http://127.0.0.1:8000/
                                      ↓
┌────────────────────────────────────────────────────────┐
│              后端 API 服务（FastAPI）                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  路由处理 | 数据验证 | CORS控制              │  │
│  └────────┬─────────────────────────────────────────┘  │
│           │                                            │
│    ┌──────┼──────┬─────────────┬────────────┐          │
│    ↓      ↓      ↓             ↓            ↓          │
│  查询LLM │ 地理 │  缓存系统 │  USGS API   │  对话LLM  │
│ (Qwen)  │ 处理 │  (双层缓存) │  (数据源)  │ (DeepSeek)│
│        ├─────────────────────────────────────────────┘  │
│                                                   │          │
└───────────────────────────────────────────┼──────────┘
                                                    ↓
                                         ┌──────────────┐
                                         │  外部服务     │
                                         │  • SiliconFlow │
                                         │  • USGS API   │
                                         └──────────────┘
```

### 技术栈

#### 后端技术

| 技术 | 版本 | 说明 |
|------|------|------|
| Python | 3.8+ | 核心开发语言 |
| FastAPI | 0.115.6 | Web框架，高性能异步API |
| Uvicorn | 0.30.6 | Python异步服务器 |
| Pydantic | 2.0.0+ | 数据验证和序列化 |
| httpx | 0.27.2 | 异步HTTP客户端 |
| python-dotenv | 1.0.1 | 环境配置管理 |
| GeoPandas | 1.1.0+ | 地理数据处理（GADM读取） |
| Shapely | 2.1.0+ | 几何运算（点在多边形检测） |

#### 前端技术

| 技术 | 版本 | 说明 |
|------|------|------|
| JavaScript | ES6+ | 主要开发语言 |
| Leaflet | 1.9.4 | 地图可视化库 |
| Chart.js | 4.5.1 | 图表库 |
| Vite | 7.2.4 | 前端构建工具 |
| noUiSlider | 15.7.1 | 范围滑块组件 |
| Marked.js | Latest | Markdown解析器 |
| DOMPurify | 3.0.9 | XSS防护 |
| highlight.js | 11.9.0 | 代码语法高亮 |

#### AI 模型

| 用途 | 模型 | 提供商 | 特点 |
|------|------|--------|------|
| 查询解析 | Qwen 2.5-7B-Instruct | SiliconFlow | 中文NLP，JSON格式化，响应快 |
| 知识问答 | DeepSeek V3 | SiliconFlow | 128K上下文，专业领域知识强 |

---

## 📊 核心算法解析

### 1. 四层级地理匹配系统

系统会优先匹配更具体的区域：

```
第1层级：中国城市（368个）
  ↓ 匹配：如"北京市"、"上海市"、"广州市"

第2层级：中国省份（37个）
  ↓ 匹配：如"四川省"、"浙江省"、"台湾省"

第3层级：国家（258个）
  ↓ 匹配：如"日本"、"新西兰"、"印度尼西亚"

第4层级：特殊区域（洲、大洋）
  ↓ 匹配：如"亚洲"、"北美洲"、"太平洋"
```

**工作原理**：
1. 读取用户查询中的关键词
2. 逐层匹配，找到最具体的区域
3. 使用该区域的多边形边界进行精确过滤
4. 如果有多边形可用，用Shapely判断地震点是否在边界内

### 2. 多边形空间过滤

传统方法用矩形边界框（BBox）会包含边界外的点，本系统用精确的多边形：

```
传统BBox过滤（左）：          多边形过滤（右）：
┌─────────────────┐              ┌────────┐         ┌─────┐
│      △        │     查询     │  △   │   △   │     △   │
│    △  △  △△   │  →  返回      │  △   │   △   │     △   │
│      △        │  包含外部  │  △   │   △   │     △   │
└─────────────────┘              │  └────────┘         │
包含大量边界外误判                 │只包含边界内   │
```

### 3. 日期变更线处理

当查询跨越太平洋（如"太平洋的地震"）时：

1. 检测到经度范围：minlon > maxlon（如100到-70度）
2. 自动分割为两个查询：
   - 西半球：[-180, -70]
   - 东半球：[100, 180]
3. 并行执行两个查询
4. 合并结果并去重（按USGS事件ID）

### 4. 双LLM协作机制

**分工协作**：

| 任务 | 负责模型 | 作用 |
|------|---------|------|
| 解析用户查询 | Qwen 2.5-7B | 理解自然语言，生成结构化查询计划（JSON格式） |
| 生成回答 | DeepSeek V3 | 地震数据分析和知识问答，流式输出 |

**工作流程**：
1. 用户输入："过去7天全球5级以上地震"
2. 查询LLM（Qwen）：解析→生成JSON计划
3. 验证计划：检查参数合理性，自动修正错误
4. 执行查询：调用USGS API获取数据
5. 数据处理：地理过滤 + 统计计算
6. 用户提问分析：注入统计摘要 + Top20强震数据
7. 生成回答：对话LLM（DeepSeek）流式输出专业回答

---

## ⚙️ 安装与配置

### 环境要求

- **Python**: 3.8 或更高版本
- **Node.js**: 18 或更高版本（开发模式）
- **内存**: 至少 4GB RAM（推荐8GB）
- **磁盘**: 至少 1GB 空闲空间
- **网络**: 需要访问外网（CDN、USGS API、LLM API）

### 安装步骤

#### 第1步：克隆项目

```bash
git clone https://github.com/[您的用户名]/earthquake-agent.git
cd earthquake-agent
```

#### 第2步：后端配置

```bash
cd api
python -m venv .venv

# Windows
.venv\Scripts\activate
# 或 Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

**依赖说明**（requirements.txt）：
```
fastapi==0.115.6           # Web框架
uvicorn[standard]==0.30.6   # Python服务器
httpx==0.27.2               # 异步HTTP客户端
python-dotenv==1.0.1        # 环境变量加载
tzdata==2025.2               # 时区数据库
geopandas>=1.1.0           # 地理数据处理（重要！）
shapely>=2.1.0             # 几何计算（重要！）
pydantic>=2.0.0             # 数据验证（重要！）
```

#### 第3步：配置环境变量

在 `api/` 目录下创建 `.env` 文件：

```env
# 查询模型配置
QUERY_API_KEY=你的_SiliconFlow_API_密钥
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

# 聊天模型配置
CHAT_API_KEY=你的_SiliconFlow_API_密钥
CHAT_BASE_URL=https://api.siliconflow.cn/v1
CHAT_MODEL=deepseek-ai/DeepSeek-V3
```

**获取API密钥**：
- 访问：https://cloud.siliconflow.cn/
- 注册账号 → 控制台 → API密钥 → 创建新密钥

#### 第4步：下载地理数据（必须！没有这些数据区域识别功能无法使用）

**GADM 数据（中国省市边界）**：
1. 访问：https://gadm.org/download_country_v4.html
2. 选择 "China"（中国）
3. 文件格式选择：GeoPackage
4. 下载后解压，将 `gadm41_CHN.gpkg` (约76MB) 放到：
   ```
   api/boundaries/gadm41_CHN.gpkg
   ```

**Natural Earth 数据（全球国家边界）**：
1. 访问：https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
2. 下载文件：`ne_10m_admin_0_countries.zip`
3. 解压到：
   ```
   api/boundaries/natural_earth/
   ```

**regions.json 文件**：
在 `api/boundaries/` 目录下创建 `regions.json`，内容如下：

```json
{
  "regions": {
    "全球": {
      "name_en": "Global",
      "bbox": [-180.0, -90.0, 180.0, 90.0],
      "aliases": ["global", "世界", "地球", "全世界"]
    },
    "亚洲": {
      "name_en": "Asia",
      "bbox": [26.0, -11.0, 169.0, 81.0],
      "log_aliases": ["asia", "Asian"]
    },
    "北美": {
      "name_en": "North America",
      "bbox": [-170.0, 15.0, -50.0, 85.0]
    },
    "南美": {
      "name_en": "South America",
      "bbox": [-82.0, -56.0, -34.0, 13.0]
    },
    "欧洲": {
      "name_en": "Europe",
      "bbox": [-10.0, 36.0, 60.0, 71.0]
    },
    "非洲": {
      "name_en": "Africa",
      "bbox": [-17.0, -35.0, 51.0, 37.0]
    },
    "大洋洲": {
      "name_en": "Oceania",
      "bbox": [110.0, -50.0, 180.0, 0.0]
    },
    "太平洋": {
      "name_en": "Pacific Ocean",
      "bbox": [100.0, -70.0, -70.0, 65.0]
    },
    "大西洋": {
      "name_en": "Atlantic Ocean",
      "bbox": [-80.0, -70.0, 20.0, 70.0]
    },
    "印度洋": {
      "name_en": "Indian Ocean",
      "bbox": [20.0, -60.0, 147.0, 30.0]
    }
  }
}
```

#### 第5步：安装前端依赖（可选，开发模式）

```bash
cd web
npm install
```

**前端依赖说明**（package.json）：
```
{
  "dependencies": {
    "leaflet": "^1.9.4",        // 地图库
    "leaflet.heat": "^0.2.0",    // 热力图插件
    "chart.js": "^4.5.1"          // 图表库
  },
  "devDependencies": {
    "vite": "^7.2.4"            // 开发服务器
  }
}
```

**注意**：前端使用了CDN加载，实际开发时只需要安装开发服务器（vite），地图和图表库自动从CDN加载。

### 启动服务

#### Windows（PowerShell）

```powershell
# 在项目根目录执行
.\scripts\start.ps1
```

脚本会：
1. 检查服务是否已运行
2. 启动后端服务（端口8000）
3. 启动前端开发服务器（端口5173）
4. 输出访问URL

**管理命令**：
```powershell
.\scripts\status.ps1  # 查看服务状态
.\scripts\stop.ps1    # 停止所有服务
```

#### Linux/macOS

```bash
# 终端1：启动后端
cd api
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 终端2：启动前端
cd web
npm run dev
```

### 访问应用

- **前端地址**: http://localhost:5173/
- **后端API文档**: http://127.0.0.1:8000/docs（Swagger UI交互式文档）
- **健康检查**: http://127.0.0.1:8000/health

---

## 📖 使用指南

### 快速开始

1. 打开浏览器，访问 http://localhost:5173/
2. 在顶部搜索框输入查询：
   ```
   过去7天全球5级以上的地震
   ```
3. 点击"查询"按钮
4. 等待数据加载完成
5. 查看地图、统计图表、详细列表
6. 使用右侧聊天栏与AI对话分析数据

### 查询示例

#### 时间查询

**相对时间**：
```
过去3天的地震
最近24小时的地震
过去一周的地震
过去一个月的地震
```

**绝对时间**：
```
2024年的地震
2024年1-3月的地震
2024年5月12日的地震（汶川地震纪念日）
```

#### 空间查询

**国家级查询**：
```
日本的地震
新西兰的地震
美国的地震
印尼的地震
```

**中国省份查询**：
```
四川省的地震
浙江省的地震
台湾省的地震
广东省的地震
```

**中国城市查询**：
```
上海的地震
北京的地震
成都的地震
深圳的地震
```

**大区域查询**：
```
亚洲的地震
北美洲的地震
环太平洋带的地震
太平洋的地震
```

#### 震级查询

**数值范围**：
```
5级以上的地震
6级到7级之间的地震
震级大于8.0的地震
```

**描述性查询**：
```
大地震（6级以上）
强震（7级以上）
特大地震（8级以上）
微弱地震（小于3级）
```

#### 深度查询

```
浅源地震（<70km）
中源地震（70-300km）
深源地震（>300km）
```

#### 组合查询

```
2024年亚洲5级以上的深源地震
过去一周环太平洋带6级以上的浅源地震
台湾海峡过去一年的强震（6级以上）
```

### 高级功能使用

#### 1. 切换地图模式

右下角工具栏第一个按钮：
- 默认：标准模式（高德地图）- 国内速度快，无需VPN
- 点击切换到：命令模式（深色主题）- 适合长时间分析
- 再次切换到：卫星视图（Esri卫星图）- 视觉冲击力强

#### 2. 开关热力图模式

右下角工具栏第二个按钮：
- 开启/关闭热力图
- 热力图用颜色深浅表示地震密度
- 可通过震级调整强度分布

#### 3. 调整地图缩放

三种方式：
- **鼠标滚轮**：以鼠标位置为中心缩放
- **界面按钮**：右下角 +/-
- **键盘快捷键**：+ / -

#### 4. 二次筛选数据

搜索栏右侧的筛选按钮：
1. 打开下拉面板
2. 拖动震级滑块（0-10）筛选震级范围
3. 拖动深度滑块（0-700km）筛选深度范围
4. 实时显示筛选结果数量
5. 点击"重置筛选"恢复所有数据

#### 5. AI对话功能

右侧聊天面板：
1. 点击聊天图标展开侧边栏
2. 输入问题并按Enter发送
3. AI流式输出答案（实时渲染）
4. 支持Markdown格式和代码高亮

**常用快捷问题**（点击快捷提示词按钮）：
- 总结本次查询
- 分析影响区域
- 分析震级分布
- 其他自定义问题

#### 6. 导出数据

右下角导出按钮：
1. 点击按钮导出菜单
2. 选择格式：
   - CSV：Excel可直接打开
   - GeoJSON：GIS软件格式
3. 自动下载文件（带时间戳）

---

## 🔧 API 接口文档

### 接口列表

#### 1. GET /health

**功能**: 健康检查，验证服务是否正常运行

**响应**：
```json
{
  "status": "ok"
}
```

#### 2. POST /api/nl-query

**功能**: 自然语言查询接口，返回地震数据

**请求体**：
```json
{
  "query": "过去7天全球5级以上地震"
}
```

**响应**：
```json
{
  "type": "map",
  "plan": {
    "window_unit": "days",
    "window_value": 7,
    "minmagnitude": 5.0,
    "limit": 100,
    "orderby": "time"
  },
  "geojson": {
    "type": "FeatureCollection",
    "features": [...],
    "metadata": {...}
  },
  "stats": {
    "count": 42,
    "max_magnitude": 7.2,
    "min_magnitude": 5.0,
    "avg_magnitude": 5.8,
    "dist_mag": {...},
    "top_20": [...]
  },
  "timing_ms": {
    "total": 6421,
    "llm": 3229,
    "usgs": 3191
  },
  "cache_hit": false,
  "llm_cache_hit": false
}
```

#### 3. POST /api/chat

**功能**: AI对话接口，返回流式响应

**请求体**：
```json
{
  "messages": [
    {
      "role": "user",
      "content": "地震是怎么形成的？"
    }
  ]
}
```

**响应**: Server-Sent Events (SSE) 流式输出

#### 4. POST /api/cache/clear

**功能**: 清除所有缓存（USGS + LLM计划）

**响应**：
```json
{
  "ok": true,
  "cache_size": 0
}
```

---

## 📁 项目结构

```
earthquake_agent/
├── api/                          # 后端代码目录
│   ├── main.py                   # 核心代码（1226行）
│   ├── requirements.txt          # Python依赖列表
│   │
│   ├── boundaries/               # 地理数据目录
│   │   ├── gadm41_CHN.gpkg       # 中国行政区划数据（76MB）
│   │   ├── natural_earth/        # Natural Earth数据
│   │   └── regions.json         # 特殊区域配置
│   │
│   ├── logs/                     # 查询日志
│   │   └── queries.jsonl         # JSONL格式日志
│   │
│   ├── .venv/                    # Python虚拟环境
│   ├── .env                      # 环境变量（不提交到Git）
│   └── .gitignore               # Git忽略文件
│
├── web/                          # 前端代码目录
│   ├── index.html                # HTML结构（289行）
│   ├── src/
│   │   ├── main.js                # 核心逻辑（1704行）
│   │   └── style.css              # 样式系统（1461行）
│   │
│   ├── package.json              # Node.js依赖配置
│   ├── package-lock.json         # 依赖锁定文件
│   └── dist/                     # 构建输出目录
│
├── scripts/                     # 管理脚本（PowerShell）
│   ├── start.ps1                 # 启动服务（119行）
│   ├── status.ps1                # 查看状态（65行）
│   ├── stop.ps1                  # 停止服务（58行）
│   └── pids/                     # 进程ID和日志文件
│       ├── api.pid                 # 后端进程ID
│       ├── web.pid                 # 前端进程ID
│       ├── api.out.log             # 后端标准输出
│       ├── api.err.log             # 后端错误日志
│       ├── web.out.log             # 前端标准输出
│       └── web.err.log             # 前端错误日志
│
├── .vscode/                      # VSCode配置
└── README.md                     # 项目文档（本文件）
```

---

## ⚙️ 配置说明

### 后端配置（api/.env）

必须配置的环境变量：

```env
# 查询模型配置
QUERY_API_KEY=your_siliconflow_api_key_here
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

# 聊天模型配置  
CHAT_API_KEY=your_siliconflow_api_key_here
CHAT_BASE_URL=https://api.siliconflow.cn/v1
CHAT_MODEL=deepseek-ai/DeepSeek-V3
```

**参数说明**：

| 参数 | 说明 | 如何获取 |
|------|------|----------|
| `QUERY_API_KEY` | SiliconFlow API密钥 | 访问 https://cloud.siliconflow.cn/ 注册账号 |
| `CHAT_API_KEY` | SiliconFlow API密钥 | 同一账号或新建 |
| `QUERY_BASE_URL` | API基础URL | 保持默认值即可 |
| `QUERY_MODEL` | 查询模型名称 | 保持默认值即可 |
| `CHAT_MODEL` | 聊天模型名称 | 保持默认值即可 |

### 前端配置（web/src/main.js）

```javascript
// 第5行：后端地址
const BACKEND_BASE = "http://127.0.0.1:8000";
```

**问题排查**：
- 如果后端运行在其他端口，需要修改这个配置
- 如果在本地访问其他服务，需要修改IP地址

### 地理数据配置

**GADM数据**：
- 下载地址：https://gadm.org/download_country_v4.html
- 下载内容：China (GeoPackage format)
- 放置位置：`api/boundaries/gadm41_CHN.gpkg`

**Natural Earth数据**：
- 下载地址：https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
- 下载文件：`ne_10m_admin_0_countries.zip`
- 解压方法：系统兼容zip或手动解压到 `api/boundaries/natural_earth/`

**regions.json配置**：

必须包含以下区域之一：
- 全球、亚洲、欧洲、北美洲、南美洲、非洲、大洋洲
- 七大洲 + 四大洋 + 全球：共13个特殊区域
- 每个 region 包含：`name_en`、`bbox`、`aliases`

---

## ❓ 常见问题解答

<details>
<summary><strong>Q1: 聊天功能没有反应，提示502错误？</strong></summary>

**原因：** 可能是API密钥配置错误或后端服务未启动。

**解决步骤：**
1. 检查后端服务是否运行：
   ```powershell
   .\scripts\status.ps1
   ```
2. 检查 `api/.env` 文件是否存在且配置正确
3. 测试API密钥有效性（在SiicnFlow控制台测试）
4. 查看后端错误日志：
   ```powershell
   cat .\scripts\pids\api.err.log | tail -20
   ```
</details>

<details>
<summary><strong>Q2: 前端连接后端失败？</strong></summary>

**原因：** 前端配置的端口与后端实际运行的端口不匹配。

**解决步骤：**
1. 查看后端实际运行端口：
   ```powershell
   netstat -ano | findstr 8000
   ```
2. 检查前端配置：
   - 打开 `web/src/main.js`
   - 第5行应该是：`const BACKEND_BASE = "http://127.0.0.1:8000";`
3. 如果不一致，修改为正确的端口
4. 重启前端服务

</details>

<details>
<summary><strong>Q3: 地理数据未加载，区域识别不工作？</strong></summary>

**原因：** 地理数据文件不存在或路径错误。

**解决步骤：**
1. 检查 `api/boundaries/` 目录是否存在
2. 确认以下文件存在：
   ```
   api/boundaries/gadm41_CHN.gpkg
   api/boundaries/natural_earth/ne_10m_admin_0_countries.shp
   api/boundaries/regions.json
   ```
3. 检查文件完整性（gadm41_CHN.gpkg应该是约76MB）
4. 查看后端启动日志，确认数据加载成功：
   ```
   [GEO] Loaded 12 special regions from JSON
   [GEO] Loaded 37 China provinces from GADM
   [GEO] Loaded 368 China cities from GADM
   [GEO] Loaded 258 countries from Natural Earth
   ```
</details>

<details>
<summary><strong>Q4: 查询速度很慢，如何优化？</strong></summary>

**原因：** 首次查询需要多个步骤（LLM解析 + USGS API调用），没有缓存。

**解决方案：**
- 系统会自动缓存结果（5分钟TTL）
- 相同或相似查询第二次会很快（<1秒）
- 可以在后台看到 `cache_hit: true`

**手动清除缓存**：
```bash
# 方法1：通过API
curl -X POST http://127.0.0.1:8000/api/cache/clear

# 方法2：重启后端服务
# 重启会清空所有缓存
```

</details>

<details>
<summary><strong>Q5: 热力图不可见或太淡？</strong></summary>

**原因：** 热力图强度计算参数不合适或数据点太少。

**解决方法**：
1. 编辑 `web/src/main.js` 第100行之前的部分
2. 调整热力图强度参数：
   ```javascript
   // 增加强度（降低分母）
   const intensity = Math.max(0.3, mag / 7.0);
   // 或
   const intensity = Math.max(0.5, mag / 6.0);  // 更强
   
   // 调整半径（扩大影响范围）
   
   L.heatLayer(points, {
     radius: 50,      // 增大半径
     blur: 30,        // 增大模糊
     maxZoom: 14
   })
   ```
3. 重启前端查看效果

</details>

<details>
<summary><strong>Q6: 如何更换地图底图？</strong></summary>

**方法1：右下角工具栏切换**
- 第一个按钮：标准模式（高德地图）→ 命令模式（深色）→ 卫星视图
- 点击按顺序循环切换

**方法2：左上角图层控制器**
- 点击地图左上角的图层按钮
- 选择需要的底图

**自定义底图**（高级设置）：
编辑 `web/src/main.js`，添加自定义TileLayer：
```javascript
const customMap = L.tileLayer("你的地图URL");
baseMaps["自定义地图"] = customMap;
```

</details>
<details>
<summary><strong>Q7: 浏览器不支持某些功能？</strong></summary>

**支持的浏览器**：
- Chrome 90+
- Firefox 103+
- Safari 14+
- Edge 90+

**已知兼容性问题**：
- `backdrop-filter`属性在旧版浏览器不支持，会显示普通背景色（不影响功能）
- 建议使用现代浏览器以获得最佳体验

</details>

<details>
<summary><strong>Q8: npm install 报错？</strong></summary>

**原因：** 本项目前端主要使用CDN加载依赖，不需要npm install包。

**说明：**
- 只有开发模式需要安装Vite（开发服务器）
- Leaflet + Chart.js 等已通过CDN加载
- 如果只是使用前端，可以直接打开 `web/index.html`

**如果仍需安装依赖**：
```bash
cd web
npm install
```

**Windows可能需要**：
```bash
npm install vite
npm list
```

</details>

<details>
<summary><strong>Q9: 如何更新项目？</strong></summary>

**更新方法**：
```bash
cd E:\Projects\earthquake_agent
git pull origin main
```

**如果有冲突**：
```bash
git stash          # 保存本地更改
git pull          # 拉取最新代码
git stash pop     # 恢复本地更改
```

</details>

<details>
<summary><strong>Q10: 部署到生产环境？</strong></summary>

**生产部署建议**：

1. **后端部署**：
   ```bash
   cd api
   # 安装生产依赖
   pip install -r requirements.txt
   
   # 使用生产配置启动（不重载模式）
   uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
   ```

2. **前端构建**：
   ```bash
   cd web
   npm run build
   # 生成 web/dist/ 目录
   ```

3. **使用Nginx代理**：
   ```nginx
   server {
       location / {
           proxy_pass http://127.0.0.1:8000;
       }
       
       location /static/ {
           alias /path/to/web/dist/;
       }
   }
   ```

4. **环境变量配置**：
   - 使用生产环境专用的API密钥
   - 配置CORS限制（只允许特定域名访问）
   - 设置日志级别
   - 启用HTTPS（生产环境必须）

</details>

---

## 🚀 更新日志

### v5.1.0（当前版本）

**新增功能**：
- ✨ 🎚️ **二次筛选面板**：下拉式玻璃态过滤面板，支持双滑块实时筛选震级和深度
- 💾 🧠️ **AI对话持久化**：对话历史自动保存到本地存储，刷新页面不丢失
- 🗺️ 📍 **高德地图集成**：新增高德地图（Light模式）作为默认底图，解决国内网络访问问题
- 🎨 🎯 **视觉对齐优化**：统一颜色规范，深度数据更清晰
- ⚡ 🔧 **后台逻辑优化**：完善无时间查询的处理逻辑

**问题修复**：
- 修复图层切换逻辑错误
- 修复深度数据显示格式问题
- 修复地图边缘显示的黑边问题
- 优化缓存命中率计算

### v5.0.0

**重大升级**：
- ✨ **UI/UX 完全重构**：从传统亮色界面升级为深色命令模式
- 🌟 **玻璃态设计语言**：引入毛玻璃效果和悬浮卡片
- 🎯 **双LLM架构**：Qwen查询解析 + DeepSeek知识问答
- 🗺️ **四级地理匹配**：城市 → 省份 → 国家 → 特殊区域
- 📊 **新增统计图表**：震级分布环图、深度分布图
- 🎮 **Mission Control工具栏**：右下角浮动工具栏
- 📥 **数据导出**：支持CSV和GeoJSON格式导出

**技术优化**：
- 移除npm包依赖，改用CDN直连
- 新增双层缓存系统
- 性能提升：92.5%缓存命中率

---

## 📖 参考资源

### 官方文档

- **USGS API文档**：https://earthquake.usgs.gov/fdsnws/event/1/
- **FastAPI文档**：https://fastapi.tiangolo.com/
- **Leaflet文档**：https://leafletjs.com/
- **Chart.js文档**：https://www.chartjs.org/
- **SiliconFlow文档**：https://docs.siliconflow.cn/

### 数据源

- **USGS地震数据**：https://earthquake.usgs.gov/fdsnws/event/1/
- **GADM地理数据**：https://gadm.org/download_world.html
- **Natural Earth数据**：https://www.naturalearthdata.com/downloads/

### 相关技术

- **GeoPandas**：https://geopandas.org/
- **Shapely**：https://shapely.readthedocs.io/
- **Qwen模型**：https://huggingface.co/Qwen/Qwen2.5-7B-Instruct
- **DeepSeek模型**：https://huggingface.co/deepseek-ai/DeepSeek-V3

---

## 🤝 贡献指南

欢迎对本项目做出贡献！

### 贡献类型

- 🐛 报告Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 优化性能
- 🌍 国际化支持

### 贡献流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m "Add amazing feature"`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 开启Pull Request

### 代码规范

- **Python代码**：遵循 PEP 8
- **JavaScript代码**：使用ES6+语法
- **提交信息**：使用清晰的语义化描述
- **注释**：重要的部分添加中文注释

---

## 📄 许可证

本项目采用 MIT License 开源许可证。

---

## 🔗 项目链接

- **GitHub仓库**：[https://github.com/您的用户名/earthquake-agent](https://github.com/[username]/earthquake-agent)
- **在线演示（如果有）**：
- **问题反馈**：[GitHub Issues](https://github.com/[username]/earthquake-agent/issues)
- **技术讨论**：[GitHub Discussions](https://github.com/[username]/earthquake-agent/discussions)

---

<div align="center">

**地震指令 | AI 助手**

*v5.1.0 © 2024*

让查询地震数据变得像对话一样简单

</div>
