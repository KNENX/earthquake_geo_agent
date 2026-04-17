# 地震智能助手

基于自然语言处理的全球地震数据查询与分析平台。用中文描述你的查询需求，系统自动完成数据检索、地理过滤与 AI 分析。

---

## 功能

- **自然语言查询** — 输入中文即可查询（如"过去一周云南5级以上地震"）
- **交互式地图** — 高德/深色/卫星三种底图，支持热力图与标记点
- **数据统计** — 震级分布、深度分布图表，实时计算
- **AI 对话** — 基于 DeepSeek 的流式问答，可分析当前查询结果
- **二次筛选** — 震级与深度滑块过滤，实时更新地图
- **数据导出** — 支持 CSV 和 GeoJSON 格式

---

## 架构

```
earthquake_agent/
├── api/                    # 后端 (FastAPI)
│   ├── main.py             # 路由入口
│   ├── config.py           # 全局配置
│   ├── models.py           # Pydantic 数据模型
│   ├── llm.py              # LLM 交互 (Prompt / 校验 / 自愈重试)
│   ├── geo.py              # 地理引擎 (GADM / Natural Earth / 多边形过滤)
│   ├── usgs.py             # USGS 数据抓取 (跨日期线处理)
│   ├── stats.py            # 统计计算 (Top50 / 分布分析)
│   ├── cache.py            # 双层缓存 (USGS + LLM, TTL 5分钟)
│   ├── logger.py           # JSONL 日志
│   ├── .env                # API 密钥 (不进 Git)
│   └── boundaries/         # 地理边界数据 (不进 Git)
│
├── web/                    # 前端 (Vue 3 + Element Plus + Tailwind CSS)
│   └── src/
│       ├── components/     # UI 组件
│       ├── stores/         # Pinia 状态管理
│       ├── api/            # Axios 接口封装
│       └── composables/    # 可复用逻辑
│
└── scripts/                # 运维脚本 (PowerShell)
    ├── start.ps1
    ├── status.ps1
    └── stop.ps1
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.8+ / FastAPI / Uvicorn |
| 地理计算 | GeoPandas / Shapely |
| 查询解析 | Qwen 2.5-7B-Instruct (SiliconFlow) |
| AI 对话 | DeepSeek V3 (SiliconFlow) |
| 前端 | Vue 3 / Element Plus / Leaflet / Chart.js |
| 状态管理 | Pinia |
| 构建 | Vite 5 |

---

## 部署

### 1. 克隆项目

```bash
git clone https://github.com/KNENX/earthquake_geo_agent.git
cd earthquake_geo_agent
```

### 2. 后端依赖

```bash
cd api
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
```

### 3. 配置 API 密钥

在 `api/` 下创建 `.env` 文件：

```env
QUERY_API_KEY=你的_API_密钥
QUERY_BASE_URL=https://api.siliconflow.cn/v1
QUERY_MODEL=Qwen/Qwen2.5-7B-Instruct

CHAT_API_KEY=你的_API_密钥
CHAT_BASE_URL=https://api.siliconflow.cn/v1
CHAT_MODEL=deepseek-ai/DeepSeek-V3
```

> 密钥申请：https://cloud.siliconflow.cn/

### 4. 下载地理数据

区域匹配功能依赖以下数据文件，缺失时地理过滤将不可用：

| 文件 | 来源 | 放置路径 |
|------|------|----------|
| `gadm41_CHN.gpkg` | [GADM](https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_CHN.gpkg)（中国省市边界，约 76MB） | `api/boundaries/` |
| `ne_10m_admin_0_countries.*` | [Natural Earth](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/)（全球国家边界） | `api/boundaries/natural_earth/` |
| `regions.json` | 见下方 | `api/boundaries/` |

<details>
<summary>regions.json 内容（点击展开）</summary>

```json
{
  "regions": {
    "全球": { "bbox": [-180.0, -90.0, 180.0, 90.0] },
    "亚洲": { "bbox": [26.0, -11.0, 169.0, 81.0] },
    "北美": { "bbox": [-170.0, 15.0, -50.0, 85.0] },
    "南美": { "bbox": [-82.0, -56.0, -34.0, 13.0] },
    "欧洲": { "bbox": [-10.0, 36.0, 60.0, 71.0] },
    "非洲": { "bbox": [-17.0, -35.0, 51.0, 37.0] },
    "大洋洲": { "bbox": [110.0, -50.0, 180.0, 0.0] },
    "太平洋": { "bbox": [100.0, -70.0, -70.0, 65.0] },
    "大西洋": { "bbox": [-80.0, -70.0, 20.0, 70.0] },
    "印度洋": { "bbox": [20.0, -60.0, 147.0, 30.0] }
  }
}
```

</details>

### 5. 前端依赖

```bash
cd web
npm install
```

### 6. 启动服务

**一键启动（推荐）：**

```powershell
.\scripts\start.ps1    # 启动
.\scripts\status.ps1   # 查看状态
.\scripts\stop.ps1     # 停止
```

**手动启动：**

```bash
# 终端 1 — 后端
cd api && uvicorn main:app --reload

# 终端 2 — 前端
cd web && npm run dev
```

### 7. 访问

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| 后端文档 | http://127.0.0.1:8000/docs |

---

## 常见问题

| 问题 | 排查方向 |
|------|----------|
| AI 查询 502 错误 | 检查 `.env` 中 `QUERY_API_KEY` 是否有效 |
| AI 对话无响应 | 检查 `.env` 中 `CHAT_API_KEY` 是否有效 |
| 区域识别不工作 | 确认 `api/boundaries/` 下三份地理数据文件完整 |
| 查询速度较慢 | 首次请求需 LLM 解析 + USGS 拉取，重复查询命中缓存（TTL 5分钟）后瞬间返回 |
| `web-vue3` 路径报错 | 前端目录已统一为 `web/`，请在该目录下运行 `npm run dev` |

---

## 许可证

MIT License
