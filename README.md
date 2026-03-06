# 地震指令 | AI 助手

基于自然语言处理的全球地震数据分析与可视化平台。用户通过中文对话即可查询、筛选、分析全球地震数据，并获得 AI 驱动的专业解读。

[![Python](https://img.shields.io/badge/python-3.8+-yellow)
![FastAPI](https://img.shields.io/badge/fastapi-0.115.6+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-5.1.0-orange)

---

## 功能概览

- **自然语言查询** — 中文输入查询意图，系统自动解析时间、区域、震级、深度等参数
- **交互式地图** — 三种底图（高德 / 深色 / 卫星），支持热力图、标记聚合、点击详情
- **数据统计** — 震级分布环图、深度分布图，实时计算
- **二次筛选** — 震级与深度双滑块过滤，实时更新地图与统计
- **AI 对话** — 基于 DeepSeek 的流式问答，可分析当前查询结果或回答地震知识
- **数据导出** — 支持 CSV 和 GeoJSON 格式一键导出
- **四级地理匹配** — 城市（368）→ 省份（37）→ 国家（258）→ 特殊区域，逐层精确匹配

---

## 系统架构

```
earthquake_agent/
├── api/                          # 后端 (FastAPI)
│   ├── main.py                   # 核心服务：查询解析、USGS 调用、地理过滤、AI 对话
│   ├── requirements.txt
│   ├── .env                      # API 密钥与模型配置
│   └── boundaries/               # 地理边界数据
│       ├── gadm41_CHN.gpkg       # 中国省市边界 (GADM)
│       ├── natural_earth/        # 全球国家边界 (Natural Earth)
│       └── regions.json          # 洲/大洋等特殊区域定义
│
├── web/                          # 前端 (原生 JS + Vite)
│   ├── index.html
│   └── src/
│       ├── main.js               # 前端逻辑：地图、图表、对话、筛选
│       └── style.css             # 样式
│
└── scripts/                      # 管理脚本 (PowerShell)
    ├── start.ps1                 # 启动前后端
    ├── status.ps1                # 查看状态
    └── stop.ps1                  # 停止服务
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python 3.8+ / FastAPI / Uvicorn | 异步 API 服务 |
| 地理计算 | GeoPandas / Shapely | 多边形空间过滤 |
| 查询解析 LLM | Qwen 2.5-7B-Instruct (SiliconFlow) | 自然语言 → 结构化查询计划 |
| 对话 LLM | DeepSeek V3.2 (SiliconFlow) | 数据分析与知识问答 |
| 前端 | JavaScript ES6+ / Leaflet / Chart.js | 地图可视化与交互 |
| 构建 | Vite | 开发服务器 |

### 数据流

```
用户输入 → 查询 LLM (Qwen) 解析为 JSON 计划
       → USGS Earthquake API 获取原始数据
       → GeoPandas/Shapely 多边形空间过滤
       → 返回 GeoJSON + 统计摘要 → 前端渲染地图与图表
       → 用户追问 → 对话 LLM (DeepSeek) 流式输出分析
```

---

## 部署指南

### 环境要求

- Python 3.8+
- Node.js 18+
- 需要外网访问（USGS API、SiliconFlow API、CDN）

### 1. 克隆项目

```bash
git clone https://github.com/KNENX/earthquake_geo_agent.git
cd earthquake_geo_agent
```

### 2. 后端配置

```bash
cd api
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. 配置环境变量

在 `api/` 目录下创建 `.env` 文件：

```env
# 查询模型配置
QUERY_API_KEY=你的_SiliconFlow_API_密钥
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

# 聊天模型配置
CHAT_API_KEY=你的_SiliconFlow_API_密钥
CHAT_BASE_URL=https://api.siliconflow.cn/v1
CHAT_MODEL=deepseek-ai/DeepSeek-V3.2
```

API 密钥获取：访问 https://cloud.siliconflow.cn/ 注册并创建密钥。

### 4. 下载地理数据

地理数据是区域识别功能的必要依赖，缺失将导致按区域过滤失效。

**GADM 数据（中国省市边界）：**

- 下载地址：https://gadm.org/download_country.html
- 选择 China → GeoPackage 格式
- 将 `gadm41_CHN.gpkg`（约 76MB）放入 `api/boundaries/`

**Natural Earth 数据（全球国家边界）：**

- 下载地址：https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
- 下载 `Admin 0 – Countries Download countries (4.7 MB) version 5.1.1`
- 解压到 `api/boundaries/natural_earth/`

**regions.json（特殊区域定义）：**

在 `api/boundaries/` 下创建 `regions.json`：

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

### 5. 安装前端依赖

```bash
cd web
npm install
```

### 6. 启动服务

**Windows (PowerShell)：**

```powershell
.\scripts\start.ps1        # 启动前后端
.\scripts\status.ps1       # 查看状态
.\scripts\stop.ps1         # 停止服务
```

**手动启动：**

```bash
# 终端 1 - 后端
cd api
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 终端 2 - 前端
cd web
npm run dev
```

### 7. 访问

- 前端：http://localhost:5173/
- API 文档：http://127.0.0.1:8000/docs

---

## 配置说明

### 地理数据配置

| 数据 | 下载地址 | 放置路径 |
|------|---------|---------|
| GADM (中国) | https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_CHN.gpkg | `api/boundaries/gadm41_CHN.gpkg` |
| Natural Earth | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ | `api/boundaries/natural_earth/` |
| regions.json | 手动创建（见上方） | `api/boundaries/regions.json` |

### 模型配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `QUERY_BASE_URL` | `https://api.siliconflow.cn/v1` | SiliconFlow API 地址 |
| `QUERY_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | 查询解析模型 |
| `CHAT_BASE_URL` | `https://api.siliconflow.cn/v1` | SiliconFlow API 地址 |
| `CHAT_MODEL` | `deepseek-ai/DeepSeek-V3.2` | 对话模型 |

---

## 常见问题

| 问题 | 排查方向 |
|------|---------|
| AI 对话无响应 / 502 | 检查 `.env` 中 API Key 是否有效，后端是否启动 |
| 前端连不上后端 | 确认 `web/src/main.js` 中 `BACKEND_BASE` 地址与后端端口一致 |
| 区域识别不工作 | 确认 `api/boundaries/` 下三份地理数据文件完整 |
| 查询较慢 | 首次查询需 LLM 解析 + USGS 调用，重复查询会命中缓存（5 分钟 TTL） |

---

## 许可证

MIT License
