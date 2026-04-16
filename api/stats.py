"""
统计计算引擎：对地震数据进行 MapReduce 式摘要压缩
生成 Top50 榜单、震级分布、区域频率统计等
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List


def compute_stats(geojson: Dict[str, Any]) -> Dict[str, Any]:
    """
    计算地震数据的丰富统计摘要。
    用于 AI 分析和前端数据面板展示，避免发送完整数据列表。
    """
    features = geojson.get("features", [])
    if not isinstance(features, list):
        features = []

    count = len(features)
    if count == 0:
        return {"count": 0, "max_magnitude": None}

    mags = []
    depths = []
    valid_features = []

    # 第一步：提取有效的震级和深度数据
    for f in features:
        props = f.get("properties") or {}
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates", [])

        mag = props.get("mag")
        depth = coords[2] if len(coords) > 2 else 0

        if isinstance(mag, (int, float)):
            mags.append(float(mag))
            depths.append(float(depth))
            valid_features.append({
                "mag": float(mag),
                "place": props.get("place", "Unknown"),
                "time": props.get("time"),
                "depth": float(depth),
                "url": props.get("url")
            })

    if not mags:
        return {"count": count, "max_magnitude": None}

    # 第二步：按震级排序，提取 Top 50 最强地震
    valid_features.sort(key=lambda x: x["mag"], reverse=True)
    top_50 = valid_features[:50]

    # 为 Top 50 添加可读的时间字符串
    for item in top_50:
        if item["time"]:
            try:
                dt = datetime.fromtimestamp(item["time"] / 1000, tz=timezone.utc)
                item["time_str"] = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
            except Exception:
                item["time_str"] = str(item["time"])

    # 第三步：区域频率统计（提取地名中的核心区域）
    region_counts = Counter()
    for f in valid_features:
        place = f["place"]
        if " of " in place:
            region = place.split(" of ")[-1].strip()
        else:
            region = place.strip()
        region_counts[region] += 1
    dist_region = dict(region_counts.most_common(10))

    # 第四步：震级区间分布
    dist_mag = {
        "3.0-4.0": len([m for m in mags if 3.0 <= m < 4.0]),
        "4.0-5.0": len([m for m in mags if 4.0 <= m < 5.0]),
        "5.0-6.0": len([m for m in mags if 5.0 <= m < 6.0]),
        "6.0-7.0": len([m for m in mags if 6.0 <= m < 7.0]),
        "7.0+":    len([m for m in mags if m >= 7.0]),
    }

    return {
        "count": count,
        "max_magnitude": max(mags),
        "min_magnitude": min(mags),
        "avg_magnitude": sum(mags) / len(mags),
        "dist_mag": dist_mag,
        "dist_region": dist_region,
        "max_depth": max(depths) if depths else 0,
        "min_depth": min(depths) if depths else 0,
        "avg_depth": sum(depths) / len(depths) if depths else 0,
        "top_50": top_50
    }
