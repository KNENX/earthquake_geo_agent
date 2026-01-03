from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


USGS_EVENT_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

app = FastAPI(title="Earthquake Agent API", version="0.1.0")

# 先放开 CORS，后面再收紧（开发期方便前端调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/usgs-test")
async def usgs_test() -> Dict[str, Any]:
    """
    MVP: Proxy USGS earthquakes as GeoJSON.

    Query: last 7 days, min magnitude 4.5, limit 100, order by time.
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

    # 轻量 sanity check
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise HTTPException(status_code=502, detail="USGS response is not GeoJSON FeatureCollection")

    # 你也可以加一些元信息，便于调试
    return {
        "source": "usgs",
        "request": {"url": USGS_EVENT_QUERY_URL, "params": params},
        "geojson": data,
    }