"""
双层缓存系统：USGS 数据缓存 + LLM 解析缓存
基于 TTL（生存时间）的内存字典实现，防止重复请求浪费资源。
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional, Tuple

# ==================== 缓存 TTL 配置 ====================
CACHE_TTL_SECONDS = 300  # 默认 5 分钟过期

# ==================== USGS 数据缓存 ====================
# 缓存 USGS 返回的原始 GeoJSON，避免短时间内重复跨洋请求
_USGS_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}

# ==================== LLM 解析缓存 ====================
# 缓存大模型的自然语言解析结果，同一问题无需再次调用 LLM
_LLM_PLAN_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def cache_key_from_params(params: Dict[str, Any]) -> str:
    """将请求参数序列化为唯一的缓存键"""
    return json.dumps(params, sort_keys=True, ensure_ascii=False)


# ---------- USGS 缓存操作 ----------

def usgs_cache_get(key: str) -> Optional[Dict[str, Any]]:
    """读取 USGS 缓存，过期则自动清除"""
    item = _USGS_CACHE.get(key)
    if not item:
        return None
    exp, val = item
    if time.time() > exp:
        _USGS_CACHE.pop(key, None)
        return None
    return val

def usgs_cache_set(key: str, val: Dict[str, Any]) -> None:
    """写入 USGS 缓存"""
    _USGS_CACHE[key] = (time.time() + CACHE_TTL_SECONDS, val)

def usgs_cache_clear() -> int:
    """清空 USGS 缓存，返回被清除的条目数"""
    count = len(_USGS_CACHE)
    _USGS_CACHE.clear()
    return count

def usgs_cache_gc(max_items: int = 200) -> None:
    """垃圾回收：清除过期条目，并限制最大缓存数量防止内存溢出"""
    now = time.time()
    expired = [k for k, (exp, _) in _USGS_CACHE.items() if exp <= now]
    for k in expired:
        _USGS_CACHE.pop(k, None)
    # 超出上限时，淘汰最早的条目
    if len(_USGS_CACHE) > max_items:
        for k in list(_USGS_CACHE.keys())[: len(_USGS_CACHE) - max_items]:
            _USGS_CACHE.pop(k, None)


# ---------- LLM 缓存操作 ----------

def llm_cache_get(key: str) -> Optional[Dict[str, Any]]:
    """读取 LLM 缓存，过期则自动清除"""
    item = _LLM_PLAN_CACHE.get(key)
    if not item:
        return None
    exp, val = item
    if time.time() > exp:
        _LLM_PLAN_CACHE.pop(key, None)
        return None
    return val

def llm_cache_set(key: str, val: Dict[str, Any]) -> None:
    """写入 LLM 缓存"""
    _LLM_PLAN_CACHE[key] = (time.time() + CACHE_TTL_SECONDS, val)
