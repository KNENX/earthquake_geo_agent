from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta
from typing import Any, Dict, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

USGS_EVENT_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Earthquake Agent API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发阶段先放开，后续可收紧
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Helpers
# -----------------------------
def _validate_date_yyyy_mm_dd(s: str) -> None:
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s}, expected YYYY-MM-DD") from e


def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(int(v), hi))


def _extract_llm_content_openai_compat(resp_json: Dict[str, Any]) -> str:
    """
    Parse OpenAI-compatible chat.completions response:
    { choices: [ { message: { content: "..." } } ] }
    """
    try:
        return resp_json["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM response: {json.dumps(resp_json)[:500]}") from e


# -----------------------------
# Models
# -----------------------------
class NLQueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class QueryPlan(BaseModel):
    dataset: Literal["usgs_earthquakes"] = "usgs_earthquakes"
    starttime: str  # YYYY-MM-DD
    endtime: str  # YYYY-MM-DD
    minmagnitude: float = 0.0
    limit: int = 200
    orderby: Literal["time", "magnitude"] = "time"


def validate_plan(plan: QueryPlan) -> QueryPlan:
    _validate_date_yyyy_mm_dd(plan.starttime)
    _validate_date_yyyy_mm_dd(plan.endtime)

    plan.limit = _clamp_int(plan.limit, 1, 500)

    if plan.minmagnitude < 0:
        plan.minmagnitude = 0.0

    return plan


def plan_to_usgs_params(plan: QueryPlan) -> Dict[str, Any]:
    return {
        "format": "geojson",
        "starttime": plan.starttime,
        "endtime": plan.endtime,
        "minmagnitude": float(plan.minmagnitude),
        "limit": int(plan.limit),
        "orderby": plan.orderby,
    }


def build_prompt(nl: str, today: str) -> str:
    """
    Prompt for stable JSON output.
    We include 'today' so the model can resolve "past N days".
    """
    return f"""
今天日期是：{today}

你是一个地震查询助手。把用户的自然语言查询转换为“USGS 地震查询计划（Query Plan）”。

你必须只输出“严格 JSON”（不要 Markdown，不要代码块，不要解释，不要多余文字），并完全符合下面 Schema：
{{
  "dataset": "usgs_earthquakes",
  "starttime": "YYYY-MM-DD",
  "endtime": "YYYY-MM-DD",
  "minmagnitude": number,
  "limit": integer (1-500),
  "orderby": "time" | "magnitude"
}}

规则：
- 如果用户说“过去/最近N天”：endtime = 今天，starttime = 今天往前推 N 天。
- 如果用户没有说明时间范围：默认最近 7 天（endtime=今天）。
- 如果用户没有说明震级条件：minmagnitude=0。
- 如果用户没有说明数量：limit=200。
- 如果用户说“最大的/按震级排序/最高震级”：orderby="magnitude" 且 limit 取 50（除非用户明确指定数量）。
- 否则 orderby="time"。

示例：
用户：过去7天震级大于5的地震
输出：{{"dataset":"usgs_earthquakes","starttime":"2025-12-27","endtime":"2026-01-03","minmagnitude":5,"limit":200,"orderby":"time"}}

用户：最近30天最大的地震
输出：{{"dataset":"usgs_earthquakes","starttime":"2025-12-04","endtime":"2026-01-03","minmagnitude":0,"limit":50,"orderby":"magnitude"}}

现在用户问题：{nl}
""".strip()


async def llm_to_plan(nl: str) -> QueryPlan:
    """
    Call SiliconFlow (OpenAI-compatible) to produce QueryPlan JSON.
    Includes one repair retry if JSON/schema parsing fails.
    """
    api_key = os.getenv("SILICONFLOW_API_KEY", "").strip()
    base_url = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1").strip()
    model = os.getenv("SILICONFLOW_MODEL", "Qwen/Qwen2.5-7B-Instruct").strip()

    if not api_key:
        raise HTTPException(status_code=500, detail="Missing SILICONFLOW_API_KEY in api/.env")

    # SiliconFlow OpenAI-compatible endpoint (commonly):
    # POST {base_url}/chat/completions
    llm_url = f"{base_url}/chat/completions"

    today = date.today().isoformat()
    prompt = build_prompt(nl, today)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # First attempt
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

    def _parse_plan(content: str) -> QueryPlan:
        obj = json.loads(content)
        plan = QueryPlan(**obj)
        return validate_plan(plan)

    try:
        return _parse_plan(content1)
    except Exception as e1:
        # Repair attempt
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
            return _parse_plan(content2)
        except Exception as e2:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse QueryPlan from LLM after repair. error={e2}; content={content2[:200]}",
            ) from e2


async def fetch_usgs(params: Dict[str, Any]) -> Dict[str, Any]:
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

    return data


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
# Routes
# -----------------------------
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/usgs-test")
async def usgs_test() -> Dict[str, Any]:
    """
    MVP test: last 7 days, min magnitude 4.5, limit 100.
    """
    today = date.today()
    start = today - timedelta(days=7)

    params = {
        "format": "geojson",
        "starttime": start.isoformat(),
        "endtime": today.isoformat(),
        "minmagnitude": 4.5,
        "limit": 100,
        "orderby": "time",
    }

    data = await fetch_usgs(params)
    return {"source": "usgs", "request": {"url": USGS_EVENT_QUERY_URL, "params": params}, "geojson": data}


@app.get("/api/query-usgs")
async def query_usgs(
    starttime: str = Query(..., description="YYYY-MM-DD"),
    endtime: str = Query(..., description="YYYY-MM-DD"),
    minmagnitude: float = Query(0.0, ge=0.0),
    limit: int = Query(200, ge=1, le=500),
    orderby: str = Query("time", pattern="^(time|magnitude)$"),
) -> Dict[str, Any]:
    _validate_date_yyyy_mm_dd(starttime)
    _validate_date_yyyy_mm_dd(endtime)

    params = {
        "format": "geojson",
        "starttime": starttime,
        "endtime": endtime,
        "minmagnitude": float(minmagnitude),
        "limit": int(limit),
        "orderby": orderby,
    }

    geo = await fetch_usgs(params)
    return {
        "source": "usgs",
        "request": {"url": USGS_EVENT_QUERY_URL, "params": params},
        "geojson": geo,
        "stats": compute_stats(geo),
    }


@app.post("/api/nl-query")
async def nl_query(payload: NLQueryIn) -> Dict[str, Any]:
    plan = await llm_to_plan(payload.query)
    params = plan_to_usgs_params(plan)
    geo = await fetch_usgs(params)

    return {
        "plan": plan.model_dump(),
        "request": {"url": USGS_EVENT_QUERY_URL, "params": params},
        "geojson": geo,
        "stats": compute_stats(geo),
    }