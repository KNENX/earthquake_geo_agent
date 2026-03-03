from __future__ import annotations

import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo

load_dotenv()

USGS_EVENT_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

# -----------------------------
# Timezone
# -----------------------------
DEFAULT_TZ = "Asia/Shanghai"  # 东八区
TZ_CST = ZoneInfo(DEFAULT_TZ)
TZ_UTC = ZoneInfo("UTC")

# -----------------------------
# USGS in-memory cache (TTL)
# -----------------------------
_USGS_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
USGS_CACHE_TTL_SECONDS = 300  # 5 minutes

def _cache_key_from_params(params: Dict[str, Any]) -> str:
    return json.dumps(params, sort_keys=True, ensure_ascii=False)

def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    item = _USGS_CACHE.get(key)
    if not item:
        return None
    exp, val = item
    if time.time() > exp:
        _USGS_CACHE.pop(key, None)
        return None
    return val

def _cache_set(key: str, val: Dict[str, Any]) -> None:
    _USGS_CACHE[key] = (time.time() + USGS_CACHE_TTL_SECONDS, val)

def _cache_gc(max_items: int = 200) -> None:
    now = time.time()
    expired = [k for k, (exp, _) in _USGS_CACHE.items() if exp <= now]
    for k in expired:
        _USGS_CACHE.pop(k, None)
    if len(_USGS_CACHE) > max_items:
        for k in list(_USGS_CACHE.keys())[: len(_USGS_CACHE) - max_items]:
            _USGS_CACHE.pop(k, None)

# -----------------------------
# LLM plan in-memory cache
# -----------------------------
_LLM_PLAN_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
LLM_PLAN_TTL_SECONDS = 300  # 5 minutes

def _llm_cache_get(key: str) -> Optional[Dict[str, Any]]:
    item = _LLM_PLAN_CACHE.get(key)
    if not item:
        return None
    exp, val = item
    if time.time() > exp:
        _LLM_PLAN_CACHE.pop(key, None)
        return None
    return val

def _llm_cache_set(key: str, val: Dict[str, Any]) -> None:
    _LLM_PLAN_CACHE[key] = (time.time() + LLM_PLAN_TTL_SECONDS, val)

# -----------------------------
# Region Boundaries (GADM + Natural Earth)
# -----------------------------
BOUNDARIES_DIR = Path(__file__).resolve().parent / "boundaries"
GADM_FILE = BOUNDARIES_DIR / "gadm41_CHN.gpkg"
NE_COUNTRIES_FILE = BOUNDARIES_DIR / "natural_earth" / "ne_10m_admin_0_countries.shp"
REGIONS_JSON = BOUNDARIES_DIR / "regions.json"

# Loaded data - organized by specificity (cities > provinces > countries)
_CHINA_CITIES: Dict[str, Any] = {}     # GADM ADM_2 (市级)
_CHINA_PROVINCES: Dict[str, Any] = {}  # GADM ADM_1 (省级)
_COUNTRIES: Dict[str, Any] = {}        # Natural Earth (国家级)
_SPECIAL_REGIONS: Dict[str, Any] = {}  # From regions.json (全球 etc)

# Chinese name mapping for countries
COUNTRY_NAME_ZH = {
    "Japan": "日本", "India": "印度", "Indonesia": "印尼", "Philippines": "菲律宾",
    "Turkey": "土耳其", "Iran": "伊朗", "Pakistan": "巴基斯坦", "Afghanistan": "阿富汗",
    "Nepal": "尼泊尔", "Chile": "智利", "Peru": "秘鲁", "Mexico": "墨西哥",
    "New Zealand": "新西兰", "Italy": "意大利", "Greece": "希腊",
    "United States of America": "美国", "Russia": "俄罗斯", "Australia": "澳大利亚",
    "Papua New Guinea": "巴布亚新几内亚", "Taiwan": "台湾",
}

def _load_regions() -> None:
    """Load region boundaries from GADM and Natural Earth."""
    global _CHINA_CITIES, _CHINA_PROVINCES, _COUNTRIES, _SPECIAL_REGIONS
    
    # 1. Load special regions (Continents, Oceans, Global)
    try:
        if REGIONS_JSON.exists():
            with open(REGIONS_JSON, "r", encoding="utf-8") as f:
                _SPECIAL_REGIONS = json.load(f).get("regions", {})
            print(f"[GEO] Loaded {len(_SPECIAL_REGIONS)} special regions from JSON")
    except Exception as e:
        print(f"[GEO] Failed to load regions.json: {e}")
    
    # 2. Load GADM China: provinces (ADM_1) and cities (ADM_2)
    try:
        if GADM_FILE.exists():
            import geopandas as gpd
            
            # Load provinces (ADM_1)
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
                # Index by Chinese names
                if name_zh:
                    for part in name_zh.split("|"):
                        part = part.strip()
                        if part:
                            _CHINA_PROVINCES[part] = data
            
            print(f"[GEO] Loaded {len(gdf_prov)} China provinces from GADM")
            
            # Load cities (ADM_2)
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
    
    # 3. Load Natural Earth countries
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
                # Add Chinese name mapping
                if name_en in COUNTRY_NAME_ZH:
                    _COUNTRIES[COUNTRY_NAME_ZH[name_en]] = data
            
            print(f"[GEO] Loaded {len(gdf_countries)} countries from Natural Earth")
    except Exception as e:
        print(f"[GEO] Failed to load Natural Earth: {e}")

def find_region_bbox(user_query: str) -> Optional[Tuple[str, List[float], Any]]:
    """Find matching region bbox from user query.
    Returns (region_name, bbox, geometry) or None if no match.
    Priority: cities > provinces > countries > special regions
    """
    # 1. Check China cities first (most specific)
    for name, data in _CHINA_CITIES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])
    
    # 2. Check China provinces
    for name, data in _CHINA_PROVINCES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])
    
    # 3. Check countries (Natural Earth)
    for name, data in _COUNTRIES.items():
        if name in user_query:
            return (name, data["bbox"], data["geometry"])
    
    # 4. Check special regions (全球 etc)
    for region_name, data in _SPECIAL_REGIONS.items():
        if region_name in user_query:
            return (region_name, data["bbox"], None)
    
    return None

def filter_earthquakes_by_region(earthquakes: List[Dict], target_region: str, geometry: Any = None) -> List[Dict]:
    """Filter earthquakes to only include those in target region.
    Uses polygon geometry if available (GADM), otherwise falls back to text matching.
    """
    if not target_region or target_region == "全球":
        return earthquakes
    
    from shapely.geometry import Point
    
    # If we have actual geometry, use polygon containment
    if geometry is not None:
        filtered = []
        for eq in earthquakes:
            coords = eq.get("geometry", {}).get("coordinates", [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                point = Point(lon, lat)
                if geometry.contains(point):
                    filtered.append(eq)
        
        if filtered:
            print(f"[GEO] Polygon filter: {len(earthquakes)} -> {len(filtered)} for '{target_region}'")
            return filtered
        else:
            print(f"[GEO] Polygon filter returned 0, falling back to text match")
    
    # Check if we have a bbox for special regions (continents/oceans)
    if target_region in _SPECIAL_REGIONS:
        bbox = _SPECIAL_REGIONS[target_region]["bbox"]
        min_lon, min_lat, max_lon, max_lat = bbox
        
        filtered = []
        for eq in earthquakes:
            coords = eq.get("geometry", {}).get("coordinates", [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                
                # Latitude check
                if not (min_lat <= lat <= max_lat):
                    continue
                
                # Longitude check (handle 180 crossing if min > max)
                if min_lon <= max_lon:
                    # Normal case
                    if min_lon <= lon <= max_lon:
                        filtered.append(eq)
                else:
                    # Crosses dateline (e.g. Pacific: 100 to -70)
                    if lon >= min_lon or lon <= max_lon:
                        filtered.append(eq)
        
        if filtered:
            print(f"[GEO] BBox filter: {len(earthquakes)} -> {len(filtered)} for '{target_region}'")
            return filtered
        else:
            print(f"[GEO] BBox filter returned 0, falling back to text match")

    # Fallback: text-based filtering using USGS place field
    # Just use target_region name for matching (no alias lookup needed)
    search_terms = [target_region.lower()]
    # Add reverse mapping for countries (if user used Chinese but USGS uses English)
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
        return earthquakes  # Return original if nothing matched
    
    return filtered


# Load regions on startup
_load_regions()

# -----------------------------
# Logging (JSONL)
# -----------------------------
LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_FILE = LOG_DIR / "queries.jsonl"
PROMPT_VERSION = "v2.0-time-mag-range"
APP_VERSION = "0.4.0"

def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

def _append_jsonl(record: Dict[str, Any]) -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass

# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Earthquake Agent API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Helpers
# -----------------------------
def _extract_llm_content_openai_compat(resp_json: Dict[str, Any]) -> str:
    try:
        return resp_json["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM response: {json.dumps(resp_json)[:500]}") from e

def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(int(v), hi))

def _clamp_float(v: float, lo: float, hi: float) -> float:
    return max(lo, min(float(v), hi))

def _iso_utc(dt_utc: datetime) -> str:
    # Ensure UTC with Z
    dt_utc = dt_utc.astimezone(TZ_UTC)
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

def compute_stats(geojson: Dict[str, Any]) -> Dict[str, Any]:
    """Compute rich statistics for Chat summary to avoid sending full list."""
    features = geojson.get("features", [])
    if not isinstance(features, list):
        features = []
    
    count = len(features)
    if count == 0:
        return {"count": 0, "max_magnitude": None}

    mags = []
    depths = []
    valid_features = []

    for f in features:
        props = f.get("properties") or {}
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates", [])
        
        mag = props.get("mag")
        # Depth is 3rd coordinate in km
        depth = coords[2] if len(coords) > 2 else 0
        
        if isinstance(mag, (int, float)):
            mags.append(float(mag))
            depths.append(float(depth))
            valid_features.append({
                "mag": float(mag),
                "place": props.get("place", "Unknown"),
                "time": props.get("time"), # timestamp ms
                "depth": float(depth),
                "url": props.get("url")
            })

    if not mags:
        return {"count": count, "max_magnitude": None}

    # Sort by magnitude descending
    valid_features.sort(key=lambda x: x["mag"], reverse=True)
    top_20 = valid_features[:20]

    # Convert timestamps to readable string for Top 20
    for item in top_20:
        if item["time"]:
            try:
                dt = datetime.fromtimestamp(item["time"] / 1000, tz=timezone.utc)
                item["time_str"] = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
            except:
                item["time_str"] = str(item["time"])

    # Magnitude distribution
    dist_mag = {
        "3.0-4.0": len([m for m in mags if 3.0 <= m < 4.0]),
        "4.0-5.0": len([m for m in mags if 4.0 <= m < 5.0]),
        "5.0-6.0": len([m for m in mags if 5.0 <= m < 6.0]),
        "6.0-7.0": len([m for m in mags if 6.0 <= m < 7.0]),
        "7.0+": len([m for m in mags if m >= 7.0]),
    }

    return {
        "count": count,
        "max_magnitude": max(mags),
        "min_magnitude": min(mags),
        "avg_magnitude": sum(mags) / len(mags),
        "dist_mag": dist_mag,
        "max_depth": max(depths) if depths else 0,
        "min_depth": min(depths) if depths else 0,
        "avg_depth": sum(depths) / len(depths) if depths else 0,
        "top_20": top_20
    }

# -----------------------------
# Magnitude phrase mapping (backend deterministic)
# -----------------------------
# 可以按需要调整阈值
MAG_PHRASE_RULES: Dict[str, Tuple[Optional[float], Optional[float]]] = {
    # very small / small
    "微弱": (None, 3.0),
    "很小": (None, 3.0),
    "较小": (None, 4.0),
    "小": (None, 4.0),

    # medium / normal
    "中等": (4.0, 6.0),
    "一般": (3.0, 5.0),
    "普通": (3.0, 5.0),

    # large / strong
    "较大": (5.0, None),
    "大": (6.0, None),
    "强": (6.0, None),
    "很强": (7.0, None),
    "巨大": (8.0, None),
    "特大": (8.0, None),
}

def apply_mag_phrase(plan_min: Optional[float], plan_max: Optional[float], phrase: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    """
    If min/max already set by user numeric constraints, we keep them.
    If missing, we apply phrase defaults.
    """
    if not phrase:
        return plan_min, plan_max

    phrase = phrase.strip()
    mapped = MAG_PHRASE_RULES.get(phrase)
    if not mapped:
        return plan_min, plan_max

    m_min, m_max = mapped
    if plan_min is None and m_min is not None:
        plan_min = m_min
    if plan_max is None and m_max is not None:
        plan_max = m_max
    return plan_min, plan_max

# -----------------------------
# Models
# -----------------------------
class NLQueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)

class NLPlan(BaseModel):

    # --- [修改点 1] 时间模式升级 ---
    # 模式 A: 相对时间 (例如: 过去 7 天)
    window_unit: Optional[Literal["hours", "days"]] = None 
    window_value: Optional[int] = None

    # 模式 B: 绝对时间 (例如: 2008-05-12)
    # 格式: "YYYY-MM-DD" 或 "YYYY-MM-DD HH:MM:SS"
    starttime: Optional[str] = None
    endtime: Optional[str] = None

    # Magnitude range: can be None
    minmagnitude: Optional[float] = None
    maxmagnitude: Optional[float] = None

    # Optional phrase label for vague queries (backend maps it)
    mag_phrase: Optional[str] = None  # e.g. "较小" / "较大" / "强" etc.

    # --- 深度字段 (单位: km) ---
    mindepth: Optional[float] = None
    maxdepth: Optional[float] = None

    # --- 新增：BBox 位置参数 ---
    minlatitude: Optional[float] = None
    maxlatitude: Optional[float] = None
    minlongitude: Optional[float] = None
    maxlongitude: Optional[float] = None

    # Result control
    limit: int = 100
    orderby: Literal["time", "magnitude"] = "time"


# Unified response model for dual-mode agent
class AgentResponse(BaseModel):
    type: Literal["map", "chat"]  # Discriminator
    # If type == "map"
    plan: Optional[Dict[str, Any]] = None
    geojson: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    usgs_params: Optional[Dict[str, Any]] = None
    cache_hit: Optional[bool] = None
    llm_cache_hit: Optional[bool] = None
    # If type == "chat"
    message: Optional[str] = None
    # Common metadata
    timing_ms: Dict[str, int] = {}

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    reply: str


def validate_plan(plan: NLPlan) -> NLPlan:
    # --- 1. 时间逻辑校验 (大幅升级) ---
    
    # 如果是相对时间模式 (window_value 存在)
    if plan.window_value is not None:
        # 解除 365 天的封印，改为允许查 100 年 (36500天)
        max_days = 36500 
        # 根据单位计算最大值
        limit_val = max_days * 24 if plan.window_unit == "hours" else max_days
        
        # 钳制数值 (最小1，最大100年)
        plan.window_value = _clamp_int(plan.window_value, 1, limit_val)

    # 如果既没有相对时间，也没有绝对时间，则默认查过去 7 天
    if plan.window_value is None and plan.starttime is None:
        plan.window_unit = "days"
        plan.window_value = 7
    # -------------------------------

    # 2. 数量限制校验
    # 策略：如果时间跨度 > 30 天，强制 limit 至少 500，以保证数据完整性
    time_span_days = 0
    if plan.window_value and plan.window_unit == 'days':
        time_span_days = plan.window_value
    elif plan.window_value and plan.window_unit == 'hours':
        time_span_days = plan.window_value / 24
    elif plan.starttime and plan.endtime:
        try:
            # 简单估算
            s = datetime.fromisoformat(plan.starttime.replace("Z", ""))
            e = datetime.fromisoformat(plan.endtime.replace("Z", ""))
            time_span_days = (e - s).days
        except:
            pass
    
    if time_span_days > 30:
        if plan.limit < 500:
            plan.limit = 500
    
    plan.limit = _clamp_int(plan.limit, 1, 500)

    # 3. 震级范围归一化 (0-10)
    if plan.minmagnitude is not None:
        plan.minmagnitude = _clamp_float(plan.minmagnitude, 0.0, 10.0)
    if plan.maxmagnitude is not None:
        plan.maxmagnitude = _clamp_float(plan.maxmagnitude, 0.0, 10.0)

    # 4. 震级交换
    if plan.minmagnitude is not None and plan.maxmagnitude is not None:
        if plan.minmagnitude > plan.maxmagnitude:
            plan.minmagnitude, plan.maxmagnitude = plan.maxmagnitude, plan.minmagnitude

    # 5. 应用模糊震级词
    plan.minmagnitude, plan.maxmagnitude = apply_mag_phrase(plan.minmagnitude, plan.maxmagnitude, plan.mag_phrase)
    
    # 6. 再次检查震级交换
    if plan.minmagnitude is not None and plan.maxmagnitude is not None:
        if plan.minmagnitude > plan.maxmagnitude:
            plan.minmagnitude, plan.maxmagnitude = plan.maxmagnitude, plan.minmagnitude

    # 7. BBox 校验
    if plan.minlatitude is not None: plan.minlatitude = _clamp_float(plan.minlatitude, -90, 90)
    if plan.maxlatitude is not None: plan.maxlatitude = _clamp_float(plan.maxlatitude, -90, 90)
    if plan.minlongitude is not None: plan.minlongitude = _clamp_float(plan.minlongitude, -180, 180)
    if plan.maxlongitude is not None: plan.maxlongitude = _clamp_float(plan.maxlongitude, -180, 180)
    
    # 8. 深度校验
    if plan.mindepth is not None: plan.mindepth = _clamp_float(plan.mindepth, -10, 1000)
    if plan.maxdepth is not None: plan.maxdepth = _clamp_float(plan.maxdepth, -10, 1000)

    return plan


def plan_to_usgs_params(plan: NLPlan) -> Dict[str, Any]:
    # 初始化基础参数
    params: Dict[str, Any] = {
        "format": "geojson",
        "limit": int(plan.limit),
        "orderby": plan.orderby,
    }

    # --- 1. 时间逻辑 (修复空指针异常) ---
    
    # 分支 A: 绝对时间 (starttime 存在)
    if plan.starttime:
        s_t = plan.starttime.strip()
        e_t = plan.endtime.strip() if plan.endtime else None

        # 补全格式
        if "T" not in s_t: s_t += "T00:00:00"
        if "Z" not in s_t: s_t += "Z"
        
        if not e_t:
             e_t = _now_iso() # 默认到现在
        else:
             if "T" not in e_t: e_t += "T23:59:59"
             if "Z" not in e_t: e_t += "Z"

        params["starttime"] = s_t
        params["endtime"] = e_t

    # 分支 B: 相对时间 (window_value 存在)
    elif plan.window_value is not None:
        # 只有在 window_value 不为 None 时才执行这里的逻辑
        
        # 时间取整缓存优化
        _now = datetime.now(TZ_CST)
        minutes_to_round = 5 
        discard = timedelta(
            minutes=_now.minute % minutes_to_round,
            seconds=_now.second,
            microseconds=_now.microsecond
        )
        now_cst = _now - discard

        # 安全转换 int (其实 validate_plan 已经保证了，但再防一手)
        val = int(plan.window_value)

        if plan.window_unit == "hours":
            start_cst = now_cst - timedelta(hours=val)
        else:
            # 默认为 days
            start_cst = now_cst - timedelta(days=val)

        start_utc = start_cst.astimezone(TZ_UTC)
        end_utc = now_cst.astimezone(TZ_UTC)
        
        params["starttime"] = _iso_utc(start_utc)
        params["endtime"] = _iso_utc(end_utc)

    # 分支 C: 兜底 (既没绝对时间也没相对时间)
    else:
        # 默认查过去 7 天
        _now = datetime.now(TZ_CST)
        start_cst = _now - timedelta(days=7)
        params["starttime"] = _iso_utc(start_cst.astimezone(TZ_UTC))
        params["endtime"] = _iso_utc(_now.astimezone(TZ_UTC))

    # -----------------------------

    # 2. 震级
    if plan.minmagnitude is not None: params["minmagnitude"] = float(plan.minmagnitude)
    if plan.maxmagnitude is not None: params["maxmagnitude"] = float(plan.maxmagnitude)

    # 3. 地点 (BBox) - 只有 4 个都不为 None 才加
    if (plan.minlatitude is not None and 
        plan.maxlatitude is not None and 
        plan.minlongitude is not None and 
        plan.maxlongitude is not None):
        
        params["minlatitude"] = float(plan.minlatitude)
        params["maxlatitude"] = float(plan.maxlatitude)
        params["minlongitude"] = float(plan.minlongitude)
        params["maxlongitude"] = float(plan.maxlongitude)

    # 4. 深度
    if plan.mindepth is not None: params["mindepth"] = float(plan.mindepth)
    if plan.maxdepth is not None: params["maxdepth"] = float(plan.maxdepth)

    return params

# -----------------------------
# Prompt
# -----------------------------
def build_prompt(nl: str, today_cst: str) -> str:
    # 提取年份，辅助 LLM 更好地理解相对/绝对时间
    current_year = today_cst.split("-")[0]

    return f"""
你是一个专业的地震查询助手。
当前时间（东八区）：{today_cst}
当前年份：{current_year}

请将用户的自然语言需求转换为 JSON 查询计划 (NLPlan)。

Schema:
{{
  "dataset": "usgs_earthquakes",
  
  // 【时间模式二选一】
  // 模式A：相对时间
  "window_unit": "hours" | "days" | null,
  "window_value": integer | null,
  // 模式B：绝对时间 (YYYY-MM-DD)
  "starttime": string | null,
  "endtime": string | null,

  "minmagnitude": number | null,
  "maxmagnitude": number | null,
  "mag_phrase": string | null,
  
  "minlatitude": number | null,
  "maxlatitude": number | null,
  "minlongitude": number | null,
  "maxlongitude": number | null,
  
  "mindepth": number | null,
  "maxdepth": number | null,
  
  "limit": integer, // 默认为100；查询时间超过30天时必须设为500
  "orderby": "time" | "magnitude"
}}

【处理规则 (严格执行)】

1. **Limit 限制**:
   - 默认查询较短时间时，limit=100 (按时间排序)
   - **长周期查询 (>1个月)**：limit=500, orderby="magnitude" (优先看大震)
   - **相对时间**: 
     - "过去3天" -> window_unit="days", window_value=3
     - "过去24小时" -> window_unit="hours", window_value=24
     - **重要**: "过去N年" -> window_unit="days", window_value=N*365 (例如 10年 -> 3650)
   - **绝对时间**:
     - 优先使用 starttime/endtime。
     - "2011年" -> start="2011-01-01", end="2011-12-31"
     - "2023年3月" -> start="2023-03-01", end="2023-03-31"
     - "2008年5月12日" -> start="2008-05-12", end="2008-05-13" (跨度1天)
   - **历史事件补全**:
     - 如果用户提到著名地震但没说时间，请根据知识库补全时间。
     - "汶川地震" -> start="2008-05-12", end="2008-05-13"
     - "唐山地震" -> start="1976-07-28", end="1976-07-29"
     - "日本311地震" -> start="2011-03-11", end="2011-03-12"

2. **地理位置 (Bounding Box)**:
   - 根据地名输出矩形范围 (minlat, maxlat, minlon, maxlon)。
   - **参考坐标库**:
     - 中国: Lat 18~54, Lon 73~135
     - 汶川/四川: Lat 30~33, Lon 102~106
     - 美国本土: Lat 24~50, Lon -125~-66
     - 加州: Lat 32~42, Lon -125~-114
     - 日本: Lat 30~46, Lon 128~146
     - 土耳其: Lat 35~42, Lon 26~45
   - 若无地名则全为 null。

3. **震级与深度**:
   - 如果用户明确指定了震级（如"大地震" -> mag_phrase="大"; "5级以上" -> minmagnitude=5.0），则严格提取。
   - **⚠️ 警告: 如果用户没有明确指定震级要求（如只说"发生过的地震"），无论是城市、国家还是全球，`minmagnitude` 必须为 `null`，严禁擅自添加如 4.0 这样的默认限制！**
   - 深度: "浅源" -> maxdepth=70; "深源" -> mindepth=300

【完整示例】

User: 过去10年全球8级大地震
JSON: {{
  "window_unit": "days", "window_value": 3650,
  "minmagnitude": 8.0,
  "limit": 100, "orderby": "time"
}}

User: 2008年汶川地震
JSON: {{
  "starttime": "2008-05-12", "endtime": "2008-05-13",
  "minlatitude": 30.5, "maxlatitude": 32.0, "minlongitude": 103.0, "maxlongitude": 105.0,
  "minmagnitude": 6.0,
  "limit": 50
}}

User: 去年日本所有的有感地震
JSON: {{
  "starttime": "{int(current_year)-1}-01-01", "endtime": "{int(current_year)-1}-12-31",
  "minlatitude": 30.0, "maxlatitude": 46.0, "minlongitude": 128.0, "maxlongitude": 146.0,
  "minmagnitude": 4.0
}}

现在用户问题：{nl}
""".strip()

# -----------------------------


# -----------------------------
# LLM call (Query - uses SiliconFlow Qwen for speed + Chinese)
# -----------------------------
async def llm_to_plan(nl: str) -> Tuple[NLPlan, bool]:
    api_key = os.getenv("QUERY_API_KEY", "").strip()
    base_url = os.getenv("QUERY_BASE_URL", "https://api.siliconflow.cn/v1").strip()
    model = os.getenv("QUERY_MODEL", "Qwen/Qwen2.5-7B-Instruct").strip()

    if not api_key:
        raise HTTPException(status_code=500, detail="Missing QUERY_API_KEY in api/.env")

    llm_url = f"{base_url}/chat/completions"

    now_cst = datetime.now(TZ_CST)
    today_cst = now_cst.strftime("%Y-%m-%d %H:%M:%S")

    prompt = build_prompt(nl, today_cst)

    # ---------- LLM cache key ----------
    cache_key_obj = {
        "q": nl,
        "today_date": today_cst.split(" ")[0],  # 只用日期部分，避免同一天内缓存失效
        "model": model,
        "prompt_version": PROMPT_VERSION,
    }
    cache_key = json.dumps(cache_key_obj, sort_keys=True, ensure_ascii=False)

    cached = _llm_cache_get(cache_key)
    if cached is not None:
        # 从缓存还原 NLPlan
        return validate_plan(NLPlan(**cached)), True
    # -----------------------------------

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    body = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "You must output ONLY valid JSON. No markdown."},
            {"role": "user", "content": prompt},
        ],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r1 = await client.post(llm_url, headers=headers, json=body)
        if r1.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LLM error {r1.status_code}: {r1.text[:400]}")
        j1 = r1.json()

    content1 = _extract_llm_content_openai_compat(j1)

    def _parse_plan(content: str) -> NLPlan:
        obj = json.loads(content)
        plan = NLPlan(**obj)
        return validate_plan(plan)

    try:
        plan = _parse_plan(content1)
        # 写入缓存
        _llm_cache_set(cache_key, plan.model_dump())
        return plan, False
    except Exception as e1:
        repair_prompt = (
            "你的输出不符合要求。你必须只输出严格 JSON，且符合 Schema。\n"
            f"错误信息：{str(e1)}\n"
            f"你的上一次输出：{content1}\n"
            "请只输出修正后的 JSON："
        )
        body2 = {
            "model": model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": "You must output ONLY valid JSON. No markdown."},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": content1},
                {"role": "user", "content": repair_prompt},
            ],
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r2 = await client.post(llm_url, headers=headers, json=body2)
            if r2.status_code != 200:
                raise HTTPException(status_code=502, detail=f"LLM repair error {r2.status_code}: {r2.text[:400]}")
            j2 = r2.json()

        content2 = _extract_llm_content_openai_compat(j2)
        try:
            plan = _parse_plan(content2)
            _llm_cache_set(cache_key, plan.model_dump())
            return plan, False
        except Exception as e2:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse NLPlan from LLM after repair. error={e2}; content={content2[:200]}",
            ) from e2

# -----------------------------
# USGS fetch (with cache)
# -----------------------------
async def _fetch_usgs_single(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch from USGS API for a single set of params."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(USGS_EVENT_QUERY_URL, params=params)
        resp.raise_for_status()
        return resp.json()

async def fetch_usgs(params: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    _cache_gc()
    key = _cache_key_from_params(params)
    cached = _cache_get(key)
    if cached is not None:
        return cached, True

    # Check for dateline-crossing bbox (minlon > maxlon)
    minlon = params.get("minlongitude")
    maxlon = params.get("maxlongitude")
    crosses_dateline = (minlon is not None and maxlon is not None and minlon > maxlon)

    try:
        if crosses_dateline:
            # Split into two queries: Western hemisphere [-180, maxlon] and Eastern [minlon, 180]
            print(f"[USGS] Dateline crossing detected: {minlon} to {maxlon}. Splitting query.")
            
            params_west = params.copy()
            params_west["minlongitude"] = -180.0
            params_west["maxlongitude"] = maxlon
            
            params_east = params.copy()
            params_east["minlongitude"] = minlon
            params_east["maxlongitude"] = 180.0
            
            # Fetch both in parallel
            import asyncio
            data_west, data_east = await asyncio.gather(
                _fetch_usgs_single(params_west),
                _fetch_usgs_single(params_east)
            )
            
            # Merge features
            features_west = data_west.get("features", [])
            features_east = data_east.get("features", [])
            merged_features = features_west + features_east
            
            # Remove duplicates by event ID (if any edge case overlap)
            seen_ids = set()
            unique_features = []
            for f in merged_features:
                fid = f.get("id")
                if fid not in seen_ids:
                    seen_ids.add(fid)
                    unique_features.append(f)
            
            # Build merged response
            data = {
                "type": "FeatureCollection",
                "metadata": data_west.get("metadata", {}),
                "features": unique_features
            }
            print(f"[USGS] Merged {len(features_west)} + {len(features_east)} = {len(unique_features)} features")
        else:
            data = await _fetch_usgs_single(params)
            
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"USGS timeout: {e}") from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"USGS error: {e.response.status_code} {e.response.text[:200]}",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}") from e

    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise HTTPException(status_code=502, detail="USGS response is not GeoJSON FeatureCollection")

    _cache_set(key, data)
    return data, False

# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

@app.post("/api/cache/clear")
def cache_clear() -> Dict[str, Any]:
    _USGS_CACHE.clear()
    return {"ok": True, "cache_size": 0}

@app.post("/api/nl-query")
async def nl_query(payload: NLQueryIn) -> Dict[str, Any]:
    t0 = time.perf_counter()

    record: Dict[str, Any] = {
        "ts": _now_iso(),
        "endpoint": "/api/nl-query",
        "app_version": APP_VERSION,
        "prompt_version": PROMPT_VERSION,
        "status": "unknown",
        "user_query": payload.query,
        "timezone": DEFAULT_TZ,
    }

    llm_ms: Optional[int] = None
    usgs_ms: Optional[int] = None
    cache_hit: Optional[bool] = None
    llm_cache_hit: Optional[bool] = None
    plan: Optional[NLPlan] = None
    usgs_params: Optional[Dict[str, Any]] = None

    try:
        # Detect region from user query for post-filtering
        region_match = find_region_bbox(payload.query)
        target_region = region_match[0] if region_match else None
        region_geometry = region_match[2] if region_match else None
        
        # LLM timing + cache
        t_llm0 = time.perf_counter()
        plan, llm_cache_hit = await llm_to_plan(payload.query)
        if llm_cache_hit:
            llm_ms = 0
        else:
            llm_ms = int((time.perf_counter() - t_llm0) * 1000)

        # Backend computes absolute times in UTC ISO
        usgs_params = plan_to_usgs_params(plan)
        
        # If we found a preset region bbox, use it instead of LLM bbox
        if region_match:
            preset_bbox = region_match[1]
            # 计算经度跨距 (maxlon - minlon, 如果跨日期线可能会变成负数，但这里 preset_bbox 是 GADM 生成的严格界限)
            lon_span = preset_bbox[2] - preset_bbox[0]
            
            # 如果是拥有远洋属地的国家，GADM 矩形会极大膨胀（例如超过 90 度）。
            # 为了防止这种覆盖全球的盲目查询把真数据挤掉（USGS 截断效应），
            # 只有在跨界合理（< 90度）或属于 "大洲/全球" 这种本身就巨大的范围时，才覆盖 bbox。
            if lon_span > 90 and target_region not in _SPECIAL_REGIONS:
                print(f"[GEO] Preset bbox for '{target_region}' spans {lon_span:.1f}° lon. Skipping override and trusting LLM bbox.")
            else:
                usgs_params["minlongitude"] = preset_bbox[0]
                usgs_params["minlatitude"] = preset_bbox[1]
                usgs_params["maxlongitude"] = preset_bbox[2]
                usgs_params["maxlatitude"] = preset_bbox[3]
                print(f"[GEO] Using preset bbox for '{target_region}': {preset_bbox}")
            
            # 自动调整震级：如果是大区域（洲/洋），且用户未指定震级，则默认过滤掉小地震
            # 避免 USGS 在美国本土的海量小地震淹没全球数据
            # 判断依据：_SPECIAL_REGIONS 中包含所有洲和洋
            if target_region in _SPECIAL_REGIONS:
                 if usgs_params.get("minmagnitude") is None:
                     print(f"[GEO] Large region '{target_region}' detected, auto-setting minmagnitude=4.5")
                     usgs_params["minmagnitude"] = 4.5

        # USGS timing
        t_usgs0 = time.perf_counter()
        geo, cache_hit = await fetch_usgs(usgs_params)
        usgs_ms = int((time.perf_counter() - t_usgs0) * 1000)
        
        # Post-filter earthquakes by region (uses polygon if available)
        if target_region and geo.get("features"):
            original_count = len(geo["features"])
            geo["features"] = filter_earthquakes_by_region(geo["features"], target_region, region_geometry)
            geo["metadata"]["count"] = len(geo["features"])  # Update count

        total_ms = int((time.perf_counter() - t0) * 1000)
        stats = compute_stats(geo)

        record.update({
            "status": "success",
            "type": "map",
            "timing_ms": {"total": total_ms, "llm": llm_ms, "usgs": usgs_ms},
            "cache_hit": cache_hit,
            "llm_cache_hit": llm_cache_hit,
            "plan": plan.model_dump(),
            "usgs_params": usgs_params,
            "result": {"count": stats.get("count"), "max_magnitude": stats.get("max_magnitude")},
            "region_filter": target_region,
        })
        _append_jsonl(record)

        return {
            "type": "map",
            "plan": plan.model_dump(),
            "geojson": geo,
            "stats": stats,
            "usgs_params": usgs_params,
            "cache_hit": cache_hit,
            "llm_cache_hit": llm_cache_hit,
            "timing_ms": {"total": total_ms, "llm": llm_ms, "usgs": usgs_ms},
        }

    except HTTPException as e:
        total_ms = int((time.perf_counter() - t0) * 1000)
        record.update({
            "status": "fail",
            "http_status": e.status_code,
            "error": str(e.detail),
            "timing_ms": {"total": total_ms, "llm": llm_ms, "usgs": usgs_ms},
            "cache_hit": cache_hit,
            "llm_cache_hit": llm_cache_hit,
            "plan": plan.model_dump() if plan else None,
            "usgs_params": usgs_params,
        })
        _append_jsonl(record)
        raise

    except Exception as e:
        # === 新增调试代码开始 ===
        import traceback
        print("======== 发生严重错误 ========")
        traceback.print_exc()  # 这行代码会把具体的报错行数打印在黑框框里
        print(f"错误详情: {str(e)}")
        print("============================")
        # === 新增调试代码结束 ===

        total_ms = int((time.perf_counter() - t0) * 1000)
        
        # 注意：这里可能会报另一个错，如果 intent_ms 等变量没定义
        # 为了安全，我们用 .get() 或者默认值
        record.update({
            "status": "fail",
            "http_status": 500,
            "error": f"Unexpected error: {str(e)}",
            "timing_ms": {
                "total": total_ms, 
                # 使用 locals().get 防止变量未定义报错
                "intent": locals().get('intent_ms', 0), 
                "llm": locals().get('llm_ms', 0), 
                "usgs": locals().get('usgs_ms', 0)
            },
            "cache_hit": locals().get('cache_hit', False),
            "llm_cache_hit": locals().get('llm_cache_hit', False),
            "plan": plan.model_dump() if plan else None,
            "usgs_params": locals().get('usgs_params', None),
        })
        _append_jsonl(record)
        # 把具体的错误发给前端，方便你在浏览器Console里看
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    """Handle multi-turn chat conversations about earthquakes (uses large model) with streaming."""
    api_key = os.getenv("CHAT_API_KEY", "").strip()
    base_url = os.getenv("CHAT_BASE_URL", "https://api.siliconflow.cn/v1").strip()
    # DeepSeek v3.2 model configuration; using SiliconFlow's typical DeepSeek V3 naming pattern as requested 
    # (assuming model name like "deepseek-ai/DeepSeek-V3" or whatever user set in .env)
    model = os.getenv("CHAT_MODEL", "deepseek-ai/DeepSeek-V3").strip()

    if not api_key:
        raise HTTPException(status_code=500, detail="Missing CHAT_API_KEY")

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    
    # Debug: Print incoming message info
    total_content_length = sum(len(m.content) for m in payload.messages)
    print(f"[CHAT DEBUG] Received {len(payload.messages)} messages, total content length: {total_content_length}")

    system_prompt = {
        "role": "system",
        "content": """你是一位严谨的地震学专家助手。

【核心规则 - 必须严格遵守】
1. **基于统计与Top20分析**：你接收到的数据是**统计摘要**（总数、分布、最值）和**Top 20 最强地震列表**。
2. **禁止编造数据**：对于 Top 20 以外的地震细节，必须明确说明"数据未提供"。
3. **宏观分析优先**：利用统计数据分析地震活动的整体趋势（如震级分布、频次）。
4. **区分数据与知识**：地震科普问题可以用专业知识回答，但数据分析必须基于实际数据。
5. **排版要求**：请使用 Markdown 格式（如加粗、列表）让回答结构更清晰，但避免过于复杂的表格。

【数据分析能力】
- 总结地震分布特征（时间、空间、震级分布）
- 详细分析 Top 20 强震的特征
- 统计不同震级区间的数量（基于提供的分布数据）
- 分析地震活动的规律和趋势

【回答格式】
- 回答数据问题时，引用格式：如"第X条（Top 20）：地点XX，震级X.X级"
- 使用简洁、专业但易懂的中文
- 如果没有数据背景但用户询问数据，请回复："请先在顶部搜索框查询地震数据，然后我可以帮您分析。\""""
    }
    messages.insert(0, system_prompt)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    body = {
        "model": model,
        "temperature": 0.7,
        "messages": messages,
        "stream": True # Enable streaming
    }

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", f"{base_url}/chat/completions", headers=headers, json=body) as response:
                    print(f"[CHAT DEBUG] LLM response status: {response.status_code}")
                    if response.status_code != 200:
                        error_text = await response.aread()
                        print(f"[CHAT DEBUG] LLM error response: {error_text.decode('utf-8')[:500]}")
                        yield f"data: {{\"error\": \"HTTP {response.status_code}\"}}\n\n"
                        return
                    
                    async for line in response.aiter_lines():
                        if line:
                            yield f"{line}\n"
                            
        except Exception as e:
            print(f"[CHAT DEBUG] Exception during stream: {e}")
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")