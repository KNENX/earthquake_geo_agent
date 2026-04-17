"""
地理空间引擎：边界数据加载、地名匹配、多边形过滤
依赖：GeoPandas（读取地图文件）、Shapely（几何计算）
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from config import GADM_FILE, NE_COUNTRIES_FILE, REGIONS_JSON

# ==================== 内存中的地理数据 ====================
_CHINA_CITIES: Dict[str, Any] = {}      # GADM 市级边界
_CHINA_PROVINCES: Dict[str, Any] = {}   # GADM 省级边界
_COUNTRIES: Dict[str, Any] = {}         # Natural Earth 国家边界
_SPECIAL_REGIONS: Dict[str, Any] = {}   # 自定义特殊区域（全球、大洲等）

# 常用国家的中英文映射
COUNTRY_NAME_ZH = {
    "Japan": "日本", "India": "印度", "Indonesia": "印尼", "Philippines": "菲律宾",
    "Turkey": "土耳其", "Iran": "伊朗", "Pakistan": "巴基斯坦", "Afghanistan": "阿富汗",
    "Nepal": "尼泊尔", "Chile": "智利", "Peru": "秘鲁", "Mexico": "墨西哥",
    "New Zealand": "新西兰", "Italy": "意大利", "Greece": "希腊",
    "United States of America": "美国", "Russia": "俄罗斯", "Australia": "澳大利亚",
    "Papua New Guinea": "巴布亚新几内亚", "Taiwan": "台湾",
}


def load_regions() -> None:
    """
    启动时调用：从磁盘加载所有地理边界数据到内存。
    包括：特殊区域(JSON) -> 中国省市(GADM) -> 全球国家(Natural Earth)
    """
    global _CHINA_CITIES, _CHINA_PROVINCES, _COUNTRIES, _SPECIAL_REGIONS

    # 1. 加载特殊区域（大洲、全球等自定义范围）
    try:
        if REGIONS_JSON.exists():
            with open(REGIONS_JSON, "r", encoding="utf-8") as f:
                _SPECIAL_REGIONS = json.load(f).get("regions", {})
            print(f"[GEO] Loaded {len(_SPECIAL_REGIONS)} special regions from JSON")
    except Exception as e:
        print(f"[GEO] Failed to load regions.json: {e}")

    # 2. 加载中国省级和市级边界（GADM 数据库）
    try:
        if GADM_FILE.exists():
            import geopandas as gpd

            # 省级 (ADM_1)
            gdf_prov = gpd.read_file(GADM_FILE, layer="ADM_ADM_1")
            for _, row in gdf_prov.iterrows():
                name_en = row.get("NAME_1", "")
                name_zh = row.get("NL_NAME_1", "") or ""
                geometry = row.geometry
                bounds = geometry.bounds
                data = {
                    "geometry": geometry,
                    "bbox": [bounds[0], bounds[1], bounds[2], bounds[3]],
                    "level": "province"
                }
                _CHINA_PROVINCES[name_en] = data
                if name_zh:
                    for part in name_zh.split("|"):
                        part = part.strip()
                        if part:
                            _CHINA_PROVINCES[part] = data
            print(f"[GEO] Loaded {len(gdf_prov)} China provinces from GADM")

            # 市级 (ADM_2)
            gdf_city = gpd.read_file(GADM_FILE, layer="ADM_ADM_2")
            for _, row in gdf_city.iterrows():
                name_en = row.get("NAME_2", "")
                name_zh = row.get("NL_NAME_2", "") or ""
                geometry = row.geometry
                bounds = geometry.bounds
                data = {
                    "geometry": geometry,
                    "bbox": [bounds[0], bounds[1], bounds[2], bounds[3]],
                    "level": "city"
                }
                _CHINA_CITIES[name_en] = data
                if name_zh:
                    for part in name_zh.split("|"):
                        part = part.strip()
                        if part:
                            _CHINA_CITIES[part] = data
            print(f"[GEO] Loaded {len(gdf_city)} China cities from GADM")
    except Exception as e:
        print(f"[GEO] Failed to load GADM: {e}")

    # 3. 加载全球国家边界（Natural Earth 数据库）
    try:
        if NE_COUNTRIES_FILE.exists():
            import geopandas as gpd
            gdf_countries = gpd.read_file(NE_COUNTRIES_FILE)
            for _, row in gdf_countries.iterrows():
                name_en = row.get("NAME", "") or row.get("ADMIN", "")
                if not name_en:
                    continue
                geometry = row.geometry
                bounds = geometry.bounds
                data = {
                    "geometry": geometry,
                    "bbox": [bounds[0], bounds[1], bounds[2], bounds[3]],
                    "level": "country"
                }
                _COUNTRIES[name_en] = data
                if name_en in COUNTRY_NAME_ZH:
                    _COUNTRIES[COUNTRY_NAME_ZH[name_en]] = data
            print(f"[GEO] Loaded {len(gdf_countries)} countries from Natural Earth")
    except Exception as e:
        print(f"[GEO] Failed to load Natural Earth: {e}")


def find_region_bbox(user_query: str) -> Optional[Tuple[str, List[float], Any]]:
    """
    从用户查询中匹配地名，返回 (地名, bbox, geometry)。
    匹配优先级：市 > 省 > 国家 > 特殊区域
    """
    for name, data in _CHINA_CITIES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])

    for name, data in _CHINA_PROVINCES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])

    for name, data in _COUNTRIES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])

    for region_name, data in _SPECIAL_REGIONS.items():
        if region_name in user_query:
            return (region_name, data["bbox"], None)

    return None


def filter_earthquakes_by_region(
    earthquakes: List[Dict], target_region: str, geometry: Any = None
) -> List[Dict]:
    """
    根据目标区域过滤地震数据。
    过滤策略（按优先级）：多边形包含 > BBox 框选 > 文本匹配
    """
    if not target_region or target_region == "全球":
        return earthquakes

    from shapely.geometry import Point

    # 策略1: 精确的多边形包含判定（GADM/Natural Earth 提供）
    if geometry is not None:
        filtered = []
        for eq in earthquakes:
            coords = eq.get("geometry", {}).get("coordinates", [])
            if len(coords) >= 2:
                point = Point(coords[0], coords[1])
                if geometry.contains(point):
                    filtered.append(eq)
        if filtered:
            print(f"[GEO] Polygon filter: {len(earthquakes)} -> {len(filtered)} for '{target_region}'")
            return filtered
        else:
            print(f"[GEO] Polygon filter returned 0, falling back to text match")

    # 策略2: 特殊区域的 BBox 框选（处理跨日期线情况）
    if target_region in _SPECIAL_REGIONS:
        bbox = _SPECIAL_REGIONS[target_region]["bbox"]
        min_lon, min_lat, max_lon, max_lat = bbox
        filtered = []
        for eq in earthquakes:
            coords = eq.get("geometry", {}).get("coordinates", [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                if not (min_lat <= lat <= max_lat):
                    continue
                if min_lon <= max_lon:
                    if min_lon <= lon <= max_lon:
                        filtered.append(eq)
                else:
                    # 跨越国际日期变更线
                    if lon >= min_lon or lon <= max_lon:
                        filtered.append(eq)
        if filtered:
            print(f"[GEO] BBox filter: {len(earthquakes)} -> {len(filtered)} for '{target_region}'")
            return filtered
        else:
            print(f"[GEO] BBox filter returned 0, falling back to text match")

    # 策略3: 基于 USGS place 字段的文本匹配（兜底）
    search_terms = [target_region.lower()]
    for en_name, zh_name in COUNTRY_NAME_ZH.items():
        if zh_name == target_region:
            search_terms.append(en_name.lower())
            break

    filtered = []
    for eq in earthquakes:
        place = eq.get("properties", {}).get("place", "").lower()
        if any(term in place for term in search_terms):
            filtered.append(eq)

    if filtered:
        print(f"[GEO] Text filter: {len(earthquakes)} -> {len(filtered)} for '{target_region}'")
    else:
        print(f"[GEO] Warning: All filters returned 0 for '{target_region}'")
        return earthquakes

    return filtered


def is_special_region(name: str) -> bool:
    """判断是否为特殊区域（大洲、全球等）"""
    return name in _SPECIAL_REGIONS
