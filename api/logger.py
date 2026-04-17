"""
日志记录器：将每次查询的详细信息写入 JSONL 文件
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

from config import LOG_DIR, LOG_FILE


def now_iso() -> str:
    """返回当前 UTC 时间的 ISO 格式字符串"""
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"


def append_log(record: Dict[str, Any]) -> None:
    """将一条查询记录追加写入 JSONL 日志文件"""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass  # 日志写入失败不应影响主业务
