"""
USGS 数据抓取层：负责向美国地质调查局请求地震数据
特色：跨太平洋日期变更线的智能分割查询 + 结果合并去重
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Tuple

import httpx
from fastapi import HTTPException

from config import USGS_EVENT_QUERY_URL
from cache import usgs_cache_gc, usgs_cache_get, usgs_cache_set, cache_key_from_params


async def _fetch_single(params: Dict[str, Any]) -> Dict[str, Any]:
    """向 USGS 发起单次请求"""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(USGS_EVENT_QUERY_URL, params=params)
        resp.raise_for_status()
        return resp.json()


async def fetch_usgs(params: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    带缓存的 USGS 数据拉取。
    自动处理跨日期变更线场景（经度 minlon > maxlon 时拆分为两次查询）。
    返回：(GeoJSON 数据, 是否来自缓存)
    """
    # 先执行缓存垃圾回收
    usgs_cache_gc()

    key = cache_key_from_params(params)
    cached = usgs_cache_get(key)
    if cached is not None:
        return cached, True

    # 检测是否需要跨日期变更线分割
    minlon = params.get("minlongitude")
    maxlon = params.get("maxlongitude")
    crosses_dateline = (minlon is not None and maxlon is not None and minlon > maxlon)

    try:
        if crosses_dateline:
            # 跨越 180° 经线：拆分为西半球 + 东半球两次并行请求
            print(f"[USGS] Dateline crossing detected: {minlon} to {maxlon}. Splitting query.")

            params_west = params.copy()
            params_west["minlongitude"] = -180.0
            params_west["maxlongitude"] = maxlon

            params_east = params.copy()
            params_east["minlongitude"] = minlon
            params_east["maxlongitude"] = 180.0

            data_west, data_east = await asyncio.gather(
                _fetch_single(params_west),
                _fetch_single(params_east)
            )

            # 合并结果并按 ID 去重
            features_west = data_west.get("features", [])
            features_east = data_east.get("features", [])
            seen_ids = set()
            unique_features = []
            for f in features_west + features_east:
                fid = f.get("id")
                if fid not in seen_ids:
                    seen_ids.add(fid)
                    unique_features.append(f)

            data = {
                "type": "FeatureCollection",
                "metadata": data_west.get("metadata", {}),
                "features": unique_features
            }
            print(f"[USGS] Merged {len(features_west)} + {len(features_east)} = {len(unique_features)} features")
        else:
            data = await _fetch_single(params)

    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"USGS timeout: {e}") from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"USGS error: {e.response.status_code} {e.response.text[:200]}",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}") from e

    # 验证返回格式
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise HTTPException(status_code=502, detail="USGS response is not GeoJSON FeatureCollection")

    usgs_cache_set(key, data)
    return data, False
