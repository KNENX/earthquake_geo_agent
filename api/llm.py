"""
LLM 交互层：负责大模型调用、Prompt 构建、查询计划校验
包含：自然语言 -> NLPlan 的完整转换流程
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import HTTPException

from config import TZ_CST, TZ_UTC, PROMPT_VERSION, get_query_llm_config
from models import NLPlan
from cache import llm_cache_get, llm_cache_set


# ==================== 工具函数 ====================

def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(int(v), hi))

def _clamp_float(v: float, lo: float, hi: float) -> float:
    return max(lo, min(float(v), hi))

def _extract_llm_content(resp_json: Dict[str, Any]) -> str:
    """从 OpenAI 兼容格式的 LLM 响应中提取文本内容"""
    try:
        return resp_json["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected LLM response: {json.dumps(resp_json)[:500]}"
        ) from e

def _iso_utc(dt_utc: datetime) -> str:
    """将 datetime 转为 UTC ISO 格式字符串"""
    dt_utc = dt_utc.astimezone(TZ_UTC)
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"


# ==================== 模糊震级词映射表 ====================
MAG_PHRASE_RULES: Dict[str, Tuple[Optional[float], Optional[float]]] = {
    "微弱": (None, 3.0), "很小": (None, 3.0),
    "较小": (None, 4.0), "小": (None, 4.0),
    "中等": (4.0, 6.0), "一般": (3.0, 5.0), "普通": (3.0, 5.0),
    "较大": (5.0, None), "大": (6.0, None), "强": (6.0, None),
    "很强": (7.0, None), "巨大": (8.0, None), "特大": (8.0, None),
}

def _apply_mag_phrase(
    plan_min: Optional[float], plan_max: Optional[float], phrase: Optional[str]
) -> Tuple[Optional[float], Optional[float]]:
    """如果用户使用了模糊词（如"大地震"），则映射为具体震级范围"""
    if not phrase:
        return plan_min, plan_max
    mapped = MAG_PHRASE_RULES.get(phrase.strip())
    if not mapped:
        return plan_min, plan_max
    m_min, m_max = mapped
    if plan_min is None and m_min is not None:
        plan_min = m_min
    if plan_max is None and m_max is not None:
        plan_max = m_max
    return plan_min, plan_max


# ==================== 查询计划校验（防止 AI 乱说话） ====================

def validate_plan(plan: NLPlan) -> NLPlan:
    """
    对 AI 输出的查询计划进行纠偏和钳制。
    确保所有参数在合理范围内，防止 USGS 接口报错。
    """
    # 1. 时间逻辑校验
    if plan.window_value is not None:
        max_days = 36500  # 允许最多查 100 年
        limit_val = max_days * 24 if plan.window_unit == "hours" else max_days
        plan.window_value = _clamp_int(plan.window_value, 1, limit_val)

    # 如果既没有相对时间也没有绝对时间，默认查过去 7 天
    if plan.window_value is None and plan.starttime is None:
        plan.window_unit = "days"
        plan.window_value = 7

    # 2. 数量限制：长周期查询强制提高 limit
    time_span_days = 0
    if plan.window_value and plan.window_unit == 'days':
        time_span_days = plan.window_value
    elif plan.window_value and plan.window_unit == 'hours':
        time_span_days = plan.window_value / 24
    elif plan.starttime and plan.endtime:
        try:
            s = datetime.fromisoformat(plan.starttime.replace("Z", ""))
            e = datetime.fromisoformat(plan.endtime.replace("Z", ""))
            time_span_days = (e - s).days
        except Exception:
            pass

    if time_span_days > 30 and plan.limit < 500:
        plan.limit = 500
    plan.limit = _clamp_int(plan.limit, 1, 500)

    # 3. 震级范围归一化 (0-10)
    if plan.minmagnitude is not None:
        plan.minmagnitude = _clamp_float(plan.minmagnitude, 0.0, 10.0)
    if plan.maxmagnitude is not None:
        plan.maxmagnitude = _clamp_float(plan.maxmagnitude, 0.0, 10.0)

    # 4. 震级交换（防止 min > max）
    if plan.minmagnitude is not None and plan.maxmagnitude is not None:
        if plan.minmagnitude > plan.maxmagnitude:
            plan.minmagnitude, plan.maxmagnitude = plan.maxmagnitude, plan.minmagnitude

    # 5. 应用模糊震级词
    plan.minmagnitude, plan.maxmagnitude = _apply_mag_phrase(
        plan.minmagnitude, plan.maxmagnitude, plan.mag_phrase
    )

    # 6. 再次检查震级交换
    if plan.minmagnitude is not None and plan.maxmagnitude is not None:
        if plan.minmagnitude > plan.maxmagnitude:
            plan.minmagnitude, plan.maxmagnitude = plan.maxmagnitude, plan.minmagnitude

    # 7. BBox 校验
    if plan.minlatitude is not None:  plan.minlatitude = _clamp_float(plan.minlatitude, -90, 90)
    if plan.maxlatitude is not None:  plan.maxlatitude = _clamp_float(plan.maxlatitude, -90, 90)
    if plan.minlongitude is not None: plan.minlongitude = _clamp_float(plan.minlongitude, -180, 180)
    if plan.maxlongitude is not None: plan.maxlongitude = _clamp_float(plan.maxlongitude, -180, 180)

    # 8. 深度校验
    if plan.mindepth is not None: plan.mindepth = _clamp_float(plan.mindepth, -10, 1000)
    if plan.maxdepth is not None: plan.maxdepth = _clamp_float(plan.maxdepth, -10, 1000)

    return plan


# ==================== NLPlan -> USGS 参数转换 ====================

def plan_to_usgs_params(plan: NLPlan) -> Dict[str, Any]:
    """将校验后的 NLPlan 转换为 USGS API 可接受的请求参数"""
    params: Dict[str, Any] = {
        "format": "geojson",
        "limit": int(plan.limit),
        "orderby": plan.orderby,
    }

    # 时间：绝对时间模式
    if plan.starttime:
        s_t = plan.starttime.strip()
        e_t = plan.endtime.strip() if plan.endtime else None
        if "T" not in s_t: s_t += "T00:00:00"
        if "Z" not in s_t: s_t += "Z"
        if not e_t:
            e_t = _now_iso()
        else:
            if "T" not in e_t: e_t += "T23:59:59"
            if "Z" not in e_t: e_t += "Z"
        params["starttime"] = s_t
        params["endtime"] = e_t

    # 时间：相对时间模式
    elif plan.window_value is not None:
        _now = datetime.now(TZ_CST)
        # 5 分钟取整，提高缓存命中率
        minutes_to_round = 5
        discard = timedelta(
            minutes=_now.minute % minutes_to_round,
            seconds=_now.second,
            microseconds=_now.microsecond
        )
        now_cst = _now - discard
        val = int(plan.window_value)

        if plan.window_unit == "hours":
            start_cst = now_cst - timedelta(hours=val)
        else:
            start_cst = now_cst - timedelta(days=val)

        params["starttime"] = _iso_utc(start_cst.astimezone(TZ_UTC))
        params["endtime"] = _iso_utc(now_cst.astimezone(TZ_UTC))

    # 时间：兜底默认 7 天
    else:
        _now = datetime.now(TZ_CST)
        start_cst = _now - timedelta(days=7)
        params["starttime"] = _iso_utc(start_cst.astimezone(TZ_UTC))
        params["endtime"] = _iso_utc(_now.astimezone(TZ_UTC))

    # 震级
    if plan.minmagnitude is not None: params["minmagnitude"] = float(plan.minmagnitude)
    if plan.maxmagnitude is not None: params["maxmagnitude"] = float(plan.maxmagnitude)

    # 地理范围 (4 个值都不为 None 时才加入)
    if all(v is not None for v in [plan.minlatitude, plan.maxlatitude, plan.minlongitude, plan.maxlongitude]):
        params["minlatitude"] = float(plan.minlatitude)
        params["maxlatitude"] = float(plan.maxlatitude)
        params["minlongitude"] = float(plan.minlongitude)
        params["maxlongitude"] = float(plan.maxlongitude)

    # 深度
    if plan.mindepth is not None: params["mindepth"] = float(plan.mindepth)
    if plan.maxdepth is not None: params["maxdepth"] = float(plan.maxdepth)

    return params


# ==================== Prompt 构建 ====================

def build_prompt(nl: str, today_cst: str) -> str:
    """构建发送给 LLM 的系统提示词"""
    current_year = today_cst.split("-")[0]
    return f"""
你是一个专业的地震查询助手。
当前时间（东八区）：{today_cst}
当前年份：{current_year}

请将用户的自然语言需求转换为 JSON 查询计划 (NLPlan)。

Schema:
{{
  "dataset": "usgs_earthquakes",
  "window_unit": "hours" | "days" | null,
  "window_value": integer | null,
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
  "limit": integer,
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


# ==================== 核心函数：自然语言 -> NLPlan ====================

async def llm_to_plan(nl: str) -> Tuple[NLPlan, bool]:
    """
    将用户的自然语言转换为结构化查询计划。
    流程：检查缓存 -> 调用 LLM -> Pydantic 校验 -> 失败则自动重试修复
    返回：(NLPlan, 是否来自缓存)
    """
    cfg = get_query_llm_config()
    if not cfg["api_key"]:
        raise HTTPException(status_code=500, detail="Missing QUERY_API_KEY in api/.env")

    llm_url = f"{cfg['base_url']}/chat/completions"
    now_cst = datetime.now(TZ_CST)
    today_cst = now_cst.strftime("%Y-%m-%d %H:%M:%S")
    prompt = build_prompt(nl, today_cst)

    # 构建缓存键（同一天 + 同一问题 = 复用）
    cache_key = json.dumps({
        "q": nl,
        "today_date": today_cst.split(" ")[0],
        "model": cfg["model"],
        "prompt_version": PROMPT_VERSION,
    }, sort_keys=True, ensure_ascii=False)

    # 命中缓存则直接返回
    cached = llm_cache_get(cache_key)
    if cached is not None:
        return validate_plan(NLPlan(**cached)), True

    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": cfg["model"],
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "You must output ONLY valid JSON. No markdown."},
            {"role": "user", "content": prompt},
        ],
    }

    # 第一次调用 LLM
    async with httpx.AsyncClient(timeout=30.0) as client:
        r1 = await client.post(llm_url, headers=headers, json=body)
        if r1.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LLM error {r1.status_code}: {r1.text[:400]}")
        j1 = r1.json()

    content1 = _extract_llm_content(j1)

    def _parse(content: str) -> NLPlan:
        obj = json.loads(content)
        return validate_plan(NLPlan(**obj))

    try:
        plan = _parse(content1)
        llm_cache_set(cache_key, plan.model_dump())
        return plan, False
    except Exception as e1:
        # 自动修复：将错误反馈给 LLM，让它重新生成
        repair_prompt = (
            "你的输出不符合要求。你必须只输出严格 JSON，且符合 Schema。\n"
            f"错误信息：{str(e1)}\n"
            f"你的上一次输出：{content1}\n"
            "请只输出修正后的 JSON："
        )
        body2 = {
            "model": cfg["model"],
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

        content2 = _extract_llm_content(j2)
        try:
            plan = _parse(content2)
            llm_cache_set(cache_key, plan.model_dump())
            return plan, False
        except Exception as e2:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse NLPlan after repair. error={e2}; content={content2[:200]}",
            ) from e2
