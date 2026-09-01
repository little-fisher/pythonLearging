"""独立智能问数历史：会话和问答轮次分表存储。"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # 本地纯前端评审可不安装MySQL驱动。
    pymysql = None
    DictCursor = None


SESSION_TABLE = "intelligent_data_sessions"
TURN_TABLE = "intelligent_data_turns"
HISTORY_MODE = os.getenv("INTELLIGENT_DATA_HISTORY_MODE", "mysql").strip().lower()
_MEMORY_HISTORY: list[dict[str, Any]] = []
BUSINESS_TIMEZONE = timezone(timedelta(hours=8))
TOOL_LABELS = {
    "intelligent_data_period_intent_tool": "识别问题与监测周期",
    "intelligent_data_report_dataset_tool": "查询并整理监测数据",
    "intelligent_data_weekly_html_tool": "生成在线分析报告",
    "intelligent_data_html_to_pdf_tool": "生成并上传PDF报告",
}


def _connect():
    if pymysql is None:
        raise RuntimeError("未安装PyMySQL，请将INTELLIGENT_DATA_HISTORY_MODE设为memory进行本地评审")
    return pymysql.connect(
        host=os.getenv("INTELLIGENT_DATA_DB_HOST", "127.0.0.1"),
        port=int(os.getenv("INTELLIGENT_DATA_DB_PORT", "3306")),
        user=os.getenv("INTELLIGENT_DATA_DB_USERNAME", ""),
        password=os.getenv("INTELLIGENT_DATA_DB_PASSWORD", ""),
        database=os.getenv("INTELLIGENT_DATA_DB_DATABASE", "influenza_surveillance"),
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
        init_command="SET time_zone = '+08:00'",
    )


def _timestamp(value: Any) -> float | None:
    """把数据库DATETIME明确按北京时间转换，避免依赖服务器操作系统时区。"""
    if not value:
        return None
    if isinstance(value, datetime):
        aware = value if value.tzinfo else value.replace(tzinfo=BUSINESS_TIMEZONE)
        return aware.timestamp()
    return None


def _find_deep(value: Any, field: str) -> Any:
    if isinstance(value, dict):
        if field in value:
            return value[field]
        for child in value.values():
            found = _find_deep(child, field)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_deep(child, field)
            if found is not None:
                return found
    return None


def _file_url(result: Any, file_type: str) -> str:
    direct = _find_deep(result, f"{file_type}_url")
    if direct:
        return str(direct)
    files = _find_deep(result, "files")
    if isinstance(files, list):
        for item in files:
            if isinstance(item, dict) and str(item.get("type", "")).lower() == file_type:
                return str(item.get("url") or "")
    return ""


def _stored_result(result: Any) -> Any:
    """解开结束节点的result_json，同时保留场景2/3完整回放数据。"""
    current = result
    for _ in range(5):
        if isinstance(current, str):
            try:
                current = json.loads(current)
            except (json.JSONDecodeError, TypeError):
                break
            continue
        if not isinstance(current, dict):
            break
        if current.get("result_json") not in (None, ""):
            current = current["result_json"]
            continue
        if set(current) == {"result"}:
            current = current["result"]
            continue
        break
    return current


def _clean_thought(item: Any) -> dict:
    if not isinstance(item, dict):
        return {"node": "", "tool": "", "output": "已完成"}
    tool = str(item.get("tool") or "")
    output = str(item.get("output") or "").strip()
    # 兼容修复前已经写入数据库的原始节点JSON，避免历史回放泄露整份报告数据。
    if output.startswith(("{", "[")) or len(output) > 500:
        try:
            parsed = json.loads(output)
        except (json.JSONDecodeError, TypeError):
            parsed = {}
        if isinstance(parsed, dict):
            if tool == "intelligent_data_period_intent_tool":
                output = str(parsed.get("normalized_question") or parsed.get("message") or "")
            elif tool == "intelligent_data_report_dataset_tool":
                titles = parsed.get("selected_module_titles") or []
                output = (
                    f"已完成数据查询，形成{'、'.join(str(value) for value in titles if value)}"
                    if titles else str(parsed.get("message") or "")
                )
            elif tool == "intelligent_data_weekly_html_tool":
                output = str(parsed.get("summary") or parsed.get("message") or "")
            else:
                output = str(parsed.get("message") or parsed.get("summary") or "")
    return {
        "node": str(item.get("node") or ""),
        "tool": tool,
        "label": TOOL_LABELS.get(tool, ""),
        "output": (output or "已完成")[:300],
    }


def save_turn(
    identity: Any, session_id: Any, question_id: Any, question: str,
    result: Any, think_process=None,
) -> None:
    # 当前无登录页面，identity仅为接口兼容保留；所有访问者共享固定后端账号历史。
    if session_id in (None, ""):
        return
    if HISTORY_MODE == "memory":
        now = time.time()
        _MEMORY_HISTORY.append({
            "session_id": str(session_id),
            "question_id": str(question_id or ""),
            "question": question,
            "result": result,
            "think_process": list(think_process or []),
            "created_at": now,
            "updated_at": now,
        })
        return
    stored_result = _stored_result(result)
    summary = str(
        _find_deep(stored_result, "summary")
        or _find_deep(stored_result, "explanation")
        or _find_deep(stored_result, "message")
        or "分析完成"
    )
    status = str(_find_deep(stored_result, "status") or "success")
    thoughts = []
    for item in think_process or []:
        thoughts.append({
            "node": item.get("node"),
            "tool": item.get("tool"),
            "output": str(item.get("output") or "")[:1000],
        })
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""INSERT INTO {SESSION_TABLE}
                    (identity_key, session_id, title, message_count, last_message_at)
                    VALUES (%s,%s,%s,0,CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                      updated_at=CURRENT_TIMESTAMP,
                      last_message_at=CURRENT_TIMESTAMP""",
                (str(identity or "shared")[:128], str(session_id), question[:255] or "未命名分析"),
            )
            cursor.execute(
                f"""SELECT id FROM {SESSION_TABLE}
                    WHERE identity_key=%s AND session_id=%s FOR UPDATE""",
                (str(identity or "shared")[:128], str(session_id)),
            )
            session_pk = int(cursor.fetchone()["id"])
            cursor.execute(
                f"""INSERT INTO {TURN_TABLE}
                    (session_pk, question_id, question, result_json, summary,
                     html_url, pdf_url, status, think_process)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                      question=VALUES(question), result_json=VALUES(result_json),
                      summary=VALUES(summary), html_url=VALUES(html_url),
                      pdf_url=VALUES(pdf_url), status=VALUES(status),
                      think_process=VALUES(think_process), updated_at=CURRENT_TIMESTAMP""",
                (
                    session_pk,
                    str(question_id) if question_id not in (None, "") else None,
                    question,
                    json.dumps(stored_result, ensure_ascii=False, default=str),
                    summary,
                    _file_url(stored_result, "html"),
                    _file_url(stored_result, "pdf"),
                    status[:32],
                    json.dumps(thoughts, ensure_ascii=False),
                ),
            )
            cursor.execute(
                f"""UPDATE {SESSION_TABLE}
                    SET message_count=(SELECT COUNT(*) FROM {TURN_TABLE} WHERE session_pk=%s),
                        updated_at=CURRENT_TIMESTAMP, last_message_at=CURRENT_TIMESTAMP
                    WHERE id=%s""",
                (session_pk, session_pk),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def list_sessions(identity: Any = None, limit: int = 30) -> list[dict]:
    if HISTORY_MODE == "memory":
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in _MEMORY_HISTORY:
            grouped.setdefault(row["session_id"], []).append(row)
        rows = [{
            "session_id": session_id,
            "title": items[0]["question"],
            "created_at": items[0]["created_at"],
            "updated_at": items[-1]["updated_at"],
            "message_count": len(items),
        } for session_id, items in grouped.items()]
        return sorted(rows, key=lambda row: row["updated_at"], reverse=True)[:limit]
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT session_id, title, created_at, updated_at, message_count
                    FROM {SESSION_TABLE}
                    WHERE identity_key=%s
                    ORDER BY updated_at DESC
                    LIMIT %s""",
                (str(identity or "shared")[:128], max(1, min(int(limit), 100))),
            )
            rows = list(cursor.fetchall())
            for row in rows:
                for field in ("created_at", "updated_at"):
                    if row.get(field):
                        row[field] = _timestamp(row[field])
            return rows
    finally:
        connection.close()


def get_session(identity: Any, session_id: Any) -> dict | None:
    if HISTORY_MODE == "memory":
        rows = [row for row in _MEMORY_HISTORY if row["session_id"] == str(session_id)]
        if not rows:
            return None
        return {
            "session_id": str(session_id),
            "title": rows[0]["question"],
            "created_at": rows[0]["created_at"],
            "updated_at": rows[-1]["updated_at"],
            "messages": [{
                "question_id": row["question_id"],
                "question": row["question"],
                "result": row["result"],
                "think_process": row["think_process"],
                "created_at": row["created_at"],
            } for row in rows],
        }
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT s.session_id, s.title, t.question_id, t.question,
                           t.result_json, t.summary, t.html_url, t.pdf_url,
                           t.status, t.think_process, t.created_at, t.updated_at
                    FROM {SESSION_TABLE} s
                    JOIN {TURN_TABLE} t ON t.session_pk=s.id
                    WHERE s.identity_key=%s AND s.session_id=%s
                    ORDER BY t.created_at ASC, t.id ASC""",
                (str(identity or "shared")[:128], str(session_id)),
            )
            rows = list(cursor.fetchall())
    finally:
        connection.close()
    if not rows:
        return None
    messages = []
    for row in rows:
        try:
            restored_result = json.loads(row.get("result_json") or "{}")
        except (json.JSONDecodeError, TypeError):
            restored_result = {"summary": row.get("summary"), "status": row.get("status")}
        try:
            thoughts = [
                _clean_thought(item)
                for item in json.loads(row.get("think_process") or "[]")
            ]
        except json.JSONDecodeError:
            thoughts = []
        messages.append({
            "question_id": row.get("question_id"),
            "question": row.get("question"),
            "result": restored_result,
            "think_process": thoughts,
            "created_at": _timestamp(row.get("created_at")),
        })
    return {
        "session_id": str(session_id),
        "title": rows[0].get("title") or rows[0].get("question") or "未命名分析",
        "created_at": _timestamp(rows[0].get("created_at")),
        "updated_at": _timestamp(rows[-1].get("updated_at")),
        "messages": messages,
    }


def delete_all_sessions(identity: Any = None) -> int:
    if HISTORY_MODE == "memory":
        total = len({row["session_id"] for row in _MEMORY_HISTORY})
        _MEMORY_HISTORY.clear()
        return total
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT COUNT(*) AS total FROM {SESSION_TABLE} WHERE identity_key=%s",
                (str(identity or "shared")[:128],),
            )
            total = int((cursor.fetchone() or {}).get("total") or 0)
            cursor.execute(
                f"DELETE FROM {SESSION_TABLE} WHERE identity_key=%s",
                (str(identity or "shared")[:128],),
            )
        connection.commit()
        return total
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
