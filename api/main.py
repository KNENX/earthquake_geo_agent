"""
Earthquake Agent API - 主入口
职责：定义 API 路由、协调各模块完成业务流程
"""
from __future__ import annotations

import time
import traceback
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from config import APP_VERSION, DEFAULT_TZ, PROMPT_VERSION, get_chat_llm_config
from models import NLQueryIn, NLPlan, ChatRequest
from cache import usgs_cache_clear
from geo import load_regions, find_region_bbox, filter_earthquakes_by_region, is_special_region
from llm import llm_to_plan, plan_to_usgs_params
from usgs import fetch_usgs
from stats import compute_stats
from logger import now_iso, append_log


# ==================== 应用初始化 ====================

app = FastAPI(title="Earthquake Agent API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 启动时加载地理边界数据（GADM + Natural Earth）
load_regions()


# ==================== 路由定义 ====================

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/cache/clear")
def cache_clear() -> Dict[str, Any]:
    """清空 USGS 缓存"""
    usgs_cache_clear()
    return {"ok": True, "cache_size": 0}


@app.post("/api/nl-query")
async def nl_query(payload: NLQueryIn) -> Dict[str, Any]:
    """
    核心路由：自然语言查询地震数据。
    流程：地名解析 -> LLM 翻译 -> USGS 抓取 -> GIS 过滤 -> 统计聚合
    """
    t0 = time.perf_counter()

    # 初始化日志记录
    record: Dict[str, Any] = {
        "ts": now_iso(),
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
        # -------- 第1步：地名解析（从预置地理库中匹配） --------
        region_match = find_region_bbox(payload.query)
        target_region = region_match[0] if region_match else None
        region_geometry = region_match[2] if region_match else None

        # -------- 第2步：LLM 将自然语言转为结构化查询 --------
        t_llm0 = time.perf_counter()
        plan, llm_cache_hit = await llm_to_plan(payload.query)
        llm_ms = 0 if llm_cache_hit else int((time.perf_counter() - t_llm0) * 1000)

        # -------- 第3步：转换为 USGS API 参数 --------
        usgs_params = plan_to_usgs_params(plan)

        # 如果地理库匹配到了预置边界，优先使用（比 LLM 生成的 BBox 更精准）
        if region_match:
            preset_bbox = region_match[1]
            lon_span = preset_bbox[2] - preset_bbox[0]

            # 超大国家（如俄罗斯）BBox 跨度过大，此时信任 LLM 的 BBox
            if lon_span > 90 and not is_special_region(target_region):
                print(f"[GEO] Preset bbox for '{target_region}' spans {lon_span:.1f}° lon. Skipping override.")
            else:
                usgs_params["minlongitude"] = preset_bbox[0]
                usgs_params["minlatitude"] = preset_bbox[1]
                usgs_params["maxlongitude"] = preset_bbox[2]
                usgs_params["maxlatitude"] = preset_bbox[3]
                print(f"[GEO] Using preset bbox for '{target_region}': {preset_bbox}")

            # 大区域自动过滤小地震，防止美国本土海量微震淹没数据
            if is_special_region(target_region):
                if usgs_params.get("minmagnitude") is None:
                    print(f"[GEO] Large region '{target_region}' detected, auto-setting minmagnitude=4.5")
                    usgs_params["minmagnitude"] = 4.5

        # -------- 第4步：向 USGS 拉取数据 --------
        t_usgs0 = time.perf_counter()
        geo, cache_hit = await fetch_usgs(usgs_params)
        usgs_ms = int((time.perf_counter() - t_usgs0) * 1000)

        # -------- 第5步：GIS 精确过滤（多边形裁剪） --------
        if target_region and geo.get("features"):
            geo["features"] = filter_earthquakes_by_region(geo["features"], target_region, region_geometry)
            geo["metadata"]["count"] = len(geo["features"])

        # -------- 第6步：统计聚合 --------
        total_ms = int((time.perf_counter() - t0) * 1000)
        stats = compute_stats(geo)

        # 写入成功日志
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
        append_log(record)

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
        append_log(record)
        raise

    except Exception as e:
        print("======== 发生严重错误 ========")
        traceback.print_exc()
        print(f"错误详情: {str(e)}")
        print("============================")

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
        append_log(record)
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")


@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    """
    AI 对话路由：流式返回大模型的分析回答。
    使用 SSE (Server-Sent Events) 实现"打字机"效果。
    """
    cfg = get_chat_llm_config()
    if not cfg["api_key"]:
        raise HTTPException(status_code=500, detail="Missing CHAT_API_KEY")

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    total_content_length = sum(len(m.content) for m in payload.messages)
    print(f"[CHAT] Received {len(payload.messages)} messages, total length: {total_content_length}")

    # 注入系统提示词：定义 AI 的角色和行为规范
    system_prompt = {
        "role": "system",
        "content": """你是一位严谨的地震学专家助手。

【核心规则 - 必须严格遵守】
1. **基于统计与Top50分析**：你接收到的数据是**统计摘要**（总数、分布、最值）和**Top 50 最强地震列表**。
2. **禁止编造数据**：对于 Top 50 以外的地震细节，必须明确说明"数据未提供"。
3. **宏观分析优先**：利用统计数据分析地震活动的整体趋势（如震级频率、地域高发统计等）。
4. **区分数据与知识**：地震科普问题可以用专业知识回答，但数据分析必须基于实际数据。
5. **排版要求**：请使用 Markdown 格式（如加粗、列表）让回答结构更清晰，但避免过于复杂的表格。

【数据分析能力】
- 总结地震分布特征（时间、空间高发地带、震级分布）
- 详细分析 Top 50 强震的特征
- 统计不同区间的数量与极值
- 分析地震活动的规律和地质趋势

【回答格式】
- 回答数据问题时，引用格式：如"第X条（Top 50）：地点XX，震级X.X级"
- 使用简洁、专业但易懂的中文
- 如果没有数据背景但用户询问数据，请回复："请先在顶部搜索框查询地震数据，然后我可以帮您分析。\""""
    }
    messages.insert(0, system_prompt)

    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": cfg["model"],
        "temperature": 0.7,
        "messages": messages,
        "stream": True
    }

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", f"{cfg['base_url']}/chat/completions", headers=headers, json=body) as response:
                    print(f"[CHAT] LLM response status: {response.status_code}")
                    if response.status_code != 200:
                        error_text = await response.aread()
                        print(f"[CHAT] LLM error: {error_text.decode('utf-8')[:500]}")
                        yield f'data: {{"error": "HTTP {response.status_code}"}}\n\n'
                        return

                    async for line in response.aiter_lines():
                        if line:
                            yield f"{line}\n"
        except Exception as e:
            print(f"[CHAT] Stream exception: {e}")
            yield f'data: {{"error": "{str(e)}"}}\n\n'

    return StreamingResponse(stream_generator(), media_type="text/event-stream")