from __future__ import annotations

import json
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Literal, Optional, Tuple

import httpx
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
    features = geojson.get("features")
    count = len(features) if isinstance(features, list) else 0

    mags = []
    if isinstance(features, list):
        for f in features:
            p = f.get("properties") or {}
            mag = p.get("mag")
            if isinstance(mag, (int, float)):
                mags.append(float(mag))

    return {
        "count": count,
        "max_magnitude": max(mags) if mags else None,
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
  
  "limit": integer, // 默认 100
  "orderby": "time" | "magnitude"
}}

【处理规则 (严格执行)】

1. **时间处理**:
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
   - 震级: "大地震" -> mag_phrase="大"; "5级以上" -> minmagnitude=5.0
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
# LLM call
# -----------------------------
async def llm_to_plan(nl: str) -> Tuple[NLPlan, bool]:
    api_key = os.getenv("SILICONFLOW_API_KEY", "").strip()
    base_url = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1").strip()
    model = os.getenv("SILICONFLOW_MODEL", "Qwen/Qwen2.5-7B-Instruct").strip()

    if not api_key:
        raise HTTPException(status_code=500, detail="Missing SILICONFLOW_API_KEY in api/.env")

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
async def fetch_usgs(params: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    _cache_gc()
    key = _cache_key_from_params(params)
    cached = _cache_get(key)
    if cached is not None:
        return cached, True

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(USGS_EVENT_QUERY_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
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
        # LLM timing + cache
        t_llm0 = time.perf_counter()
        plan, llm_cache_hit = await llm_to_plan(payload.query)
        if llm_cache_hit:
            llm_ms = 0
        else:
            llm_ms = int((time.perf_counter() - t_llm0) * 1000)

        # Backend computes absolute times in UTC ISO
        usgs_params = plan_to_usgs_params(plan)

        # USGS timing
        t_usgs0 = time.perf_counter()
        geo, cache_hit = await fetch_usgs(usgs_params)
        usgs_ms = int((time.perf_counter() - t_usgs0) * 1000)

        total_ms = int((time.perf_counter() - t0) * 1000)
        stats = compute_stats(geo)

        record.update({
            "status": "success",
            "timing_ms": {"total": total_ms, "llm": llm_ms, "usgs": usgs_ms},
            "cache_hit": cache_hit,
            "llm_cache_hit": llm_cache_hit,
            "plan": plan.model_dump(),
            "usgs_params": usgs_params,
            "result": {"count": stats.get("count"), "max_magnitude": stats.get("max_magnitude")},
        })
        _append_jsonl(record)

        return {
            "plan": plan.model_dump(),
            "request": {"url": USGS_EVENT_QUERY_URL, "params": usgs_params},
            "geojson": geo,
            "stats": stats,
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
        total_ms = int((time.perf_counter() - t0) * 1000)
        record.update({
            "status": "fail",
            "http_status": 500,
            "error": f"Unexpected error: {str(e)}",
            "timing_ms": {"total": total_ms, "llm": llm_ms, "usgs": usgs_ms},
            "cache_hit": cache_hit,
            "llm_cache_hit": llm_cache_hit,
            "plan": plan.model_dump() if plan else None,
            "usgs_params": usgs_params,
        })
        _append_jsonl(record)
        raise HTTPException(status_code=500, detail="Unexpected error")