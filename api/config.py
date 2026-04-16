"""
全局配置：环境变量、常量、时区定义
"""
from __future__ import annotations

import os
from pathlib import Path
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

load_dotenv()

# ==================== 版本信息 ====================
APP_VERSION = "0.4.0"
PROMPT_VERSION = "v2.0-time-mag-range"

# ==================== 时区 ====================
DEFAULT_TZ = "Asia/Shanghai"
TZ_CST = ZoneInfo(DEFAULT_TZ)
TZ_UTC = ZoneInfo("UTC")

# ==================== USGS 数据源 ====================
USGS_EVENT_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

# ==================== 路径 ====================
BASE_DIR = Path(__file__).resolve().parent
BOUNDARIES_DIR = BASE_DIR / "boundaries"
GADM_FILE = BOUNDARIES_DIR / "gadm41_CHN.gpkg"
NE_COUNTRIES_FILE = BOUNDARIES_DIR / "natural_earth" / "ne_10m_admin_0_countries.shp"
REGIONS_JSON = BOUNDARIES_DIR / "regions.json"
LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "queries.jsonl"

# ==================== LLM 配置（从 .env 读取） ====================
def get_query_llm_config():
    """获取 Query 模型（轻量快速模型，负责自然语言转结构化参数）"""
    return {
        "api_key": os.getenv("QUERY_API_KEY", "").strip(),
        "base_url": os.getenv("QUERY_BASE_URL", "https://api.siliconflow.cn/v1").strip(),
        "model": os.getenv("QUERY_MODEL", "Qwen/Qwen2.5-7B-Instruct").strip(),
    }

def get_chat_llm_config():
    """获取 Chat 模型（强推理模型，负责 AI 对话分析）"""
    return {
        "api_key": os.getenv("CHAT_API_KEY", "").strip(),
        "base_url": os.getenv("CHAT_BASE_URL", "https://api.siliconflow.cn/v1").strip(),
        "model": os.getenv("CHAT_MODEL", "deepseek-ai/DeepSeek-V3").strip(),
    }
