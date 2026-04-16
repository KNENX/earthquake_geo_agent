"""
Pydantic 数据模型：定义所有 API 的输入输出结构
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ==================== 请求模型 ====================

class NLQueryIn(BaseModel):
    """用户自然语言查询的输入"""
    query: str = Field(min_length=1, max_length=500)


class NLPlan(BaseModel):
    """
    AI 解析后的结构化查询计划。
    包含时间、震级、深度、地理范围等所有 USGS 查询条件。
    """
    # --- 时间模式 A: 相对时间 (如: 过去 7 天) ---
    window_unit: Optional[Literal["hours", "days"]] = None
    window_value: Optional[int] = None

    # --- 时间模式 B: 绝对时间 (如: 2008-05-12) ---
    starttime: Optional[str] = None
    endtime: Optional[str] = None

    # --- 震级 ---
    minmagnitude: Optional[float] = None
    maxmagnitude: Optional[float] = None
    mag_phrase: Optional[str] = None  # 模糊震级词，如 "较大"、"强"

    # --- 深度 (单位: km) ---
    mindepth: Optional[float] = None
    maxdepth: Optional[float] = None

    # --- 地理范围 (BBox) ---
    minlatitude: Optional[float] = None
    maxlatitude: Optional[float] = None
    minlongitude: Optional[float] = None
    maxlongitude: Optional[float] = None

    # --- 结果控制 ---
    limit: int = 100
    orderby: Literal["time", "magnitude"] = "time"


class ChatMessage(BaseModel):
    """单条聊天消息"""
    role: str
    content: str

class ChatRequest(BaseModel):
    """AI 对话请求体"""
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    """AI 对话响应体"""
    reply: str


class AgentResponse(BaseModel):
    """统一的 API 响应模型（地图查询 / 聊天共用）"""
    type: Literal["map", "chat"]
    # 地图查询字段
    plan: Optional[Dict[str, Any]] = None
    geojson: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    usgs_params: Optional[Dict[str, Any]] = None
    cache_hit: Optional[bool] = None
    llm_cache_hit: Optional[bool] = None
    # 聊天字段
    message: Optional[str] = None
    # 通用元数据
    timing_ms: Dict[str, int] = {}
