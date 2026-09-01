"""智能问数独立静态站点、SSE适配和历史服务。"""
from __future__ import annotations

import json
import os
import socket
import sys
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from history_store import delete_all_sessions, get_session, list_sessions, save_turn


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
HOST = os.getenv("INTELLIGENT_DATA_HOST", "0.0.0.0")
PORT = int(os.getenv("INTELLIGENT_DATA_PORT", "8091"))
PLATFORM_URL = os.getenv("INTELLIGENT_DATA_PLATFORM_URL", "https://chatap.adinnet.cn").rstrip("/")
AGENT_ID = os.getenv("INTELLIGENT_DATA_AGENT_ID", "242")
RECOMMENDATION_AGENT_ID = os.getenv("INTELLIGENT_DATA_RECOMMENDATION_AGENT_ID", "248").strip()
# 正式环境统一由工作流242内部完成意图识别和场景分支；local仅保留为显式联调开关。
FORECAST_MODE = os.getenv("INTELLIGENT_DATA_FORECAST_MODE", "workflow").strip().lower()
USERNAME = os.getenv("INTELLIGENT_DATA_USERNAME", "")
PASSWORD = os.getenv("INTELLIGENT_DATA_PASSWORD", "")
TENANT_NAME = os.getenv("INTELLIGENT_DATA_TENANT_NAME", "")
API_PREFIX = "/api/intelligent-data/"
SSE_NODE_RESULT_FIELDS = {
    "status", "success", "message", "summary", "sql_count",
    "selected_module_titles", "normalized_question", "html_url", "pdf_url",
    "files", "renderer",
    "scene", "result_type", "target_year", "target_week", "model_name",
    "history_rows", "age_rows", "backtest_mae",
}


def _compact_node_result(result):
    if not isinstance(result, dict):
        return result
    return {key: value for key, value in result.items() if key in SSE_NODE_RESULT_FIELDS}


def _thought_output(tool, result):
    compact = _compact_node_result(result)
    if not isinstance(compact, dict):
        return str(compact or "已完成")[:300]
    if tool == "intelligent_data_period_intent_tool":
        return str(compact.get("normalized_question") or compact.get("message") or "已识别问题周期")[:300]
    if tool == "intelligent_data_report_dataset_tool":
        titles = compact.get("selected_module_titles") or []
        title_text = "、".join(str(item) for item in titles if item)
        if title_text:
            return f"已完成数据查询，形成{title_text}"[:300]
        return str(compact.get("message") or "已完成报告数据查询")[:300]
    if tool == "intelligent_data_weekly_html_tool":
        return str(compact.get("summary") or compact.get("message") or "HTML报告已生成")[:300]
    if tool == "intelligent_data_html_to_pdf_tool":
        return str(compact.get("message") or "HTML与PDF报告已生成")[:300]
    if tool == "intelligent_data_forecast_intent_tool":
        return str(compact.get("message") or "已识别预测目标周期")[:300]
    if tool == "intelligent_data_forecast_dataset_tool":
        return (
            f"已加载{compact.get('history_rows', 0)}条全国历史和"
            f"{compact.get('age_rows', 0)}条年龄段历史"
        )[:300]
    if tool == "intelligent_data_forecast_model_tool":
        return str(compact.get("message") or "预测计算和回测已完成")[:300]
    return str(compact.get("message") or compact.get("summary") or "已完成")[:300]


class IntelligentDataHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def setup(self):
        super().setup()
        # SSE事件很小，关闭Nagle延迟，避免多个节点状态被合并后才发送。
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

    def _history_identity(self):
        # 当前无登录页面，所有访问者共享固定后端账号的历史。
        return "shared"

    def do_GET(self):
        if self.path == f"{API_PREFIX}sessions":
            self._json(200, {"status": 200, "msg": "ok", "result": list_sessions(self._history_identity())})
            return
        if self.path.startswith(f"{API_PREFIX}sessions/"):
            session_id = self.path.rsplit("/", 1)[-1]
            record = get_session(self._history_identity(), session_id)
            self._json(
                200 if record else 404,
                {"status": 200, "msg": "ok", "result": record}
                if record else {"detail": "会话不存在或已过期"},
            )
            return
        if self.path.startswith(API_PREFIX):
            self._json(404, {"detail": "Not Found"})
            return
        if self.path in {"", "/"}:
            self.path = "/index.html"
        super().do_GET()

    def do_DELETE(self):
        if self.path == f"{API_PREFIX}sessions":
            count = delete_all_sessions(self._history_identity())
            self._json(200, {"status": 200, "msg": "ok", "result": {"deleted": count}})
            return
        self._json(404, {"detail": "Not Found"})

    def do_POST(self):
        if self.path == f"{API_PREFIX}recommend":
            self._recommend()
            return
        if self.path != f"{API_PREFIX}stream":
            self._json(404, {"detail": "Not Found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            source = json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")
            question = str(source.get("question", "")).strip()
            display_question = str(source.get("display_question") or question).strip()
            if not question:
                self._json(400, {"detail": "问题不能为空"})
                return
            if FORECAST_MODE == "local":
                # 正式workflow模式不依赖本地预测服务，部署包无需携带该可选模块。
                from forecast_service import is_forecast_question
                if is_forecast_question(question):
                    self._run_local_forecast(source, question)
                    return
            token = self._get_access_token()
            payload = {
                "agent_id": AGENT_ID,
                "emit_session_created": True,
                "start_inputs": {
                    "question": question,
                    "selected_extensions_json": json.dumps(source.get("selected_extensions") or [], ensure_ascii=False),
                },
            }
            if source.get("session_id"):
                payload["session_id"] = source["session_id"]
            request = Request(
                f"{PLATFORM_URL}/api/agent/agent_run_sse",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "text/event-stream",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urlopen(request, timeout=920) as response:
                self.send_response(response.status)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("X-Accel-Buffering", "no")
                self.send_header("Connection", "close")
                self.end_headers()
                # 立即形成超过常见代理最小缓冲区的首包，确保浏览器马上进入流式读取。
                self.wfile.write((":" + " " * 2048 + "\n\n").encode("utf-8"))
                self.wfile.flush()
                event_name = "message"
                session_id = source.get("session_id")
                question_id = None
                final_result = None
                thoughts = []
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if line.startswith("event:"):
                        event_name = line[6:].strip()
                    elif line.startswith("data:"):
                        data = json.loads(line[5:].strip())
                        if event_name == "session_created":
                            session_id = data.get("session_id", session_id)
                            question_id = data.get("question_id")
                        elif event_name == "node_complete":
                            thoughts.append({
                                "node": data.get("node_id"),
                                "tool": data.get("tool"),
                                "output": _thought_output(data.get("tool"), data.get("result")),
                            })
                        elif event_name == "workflow_complete":
                            final_result = data.get("result")
                        relay_data = data
                        if event_name == "node_complete" and isinstance(data, dict):
                            relay_data = dict(data)
                            relay_data["result"] = _compact_node_result(data.get("result"))
                        block = (
                            f"event: {event_name}\n"
                            f"data: {json.dumps(relay_data, ensure_ascii=False, default=str)}\n\n"
                        ).encode("utf-8")
                        self.wfile.write(block)
                        self.wfile.flush()
                if final_result is not None:
                    save_turn(self._history_identity(), session_id, question_id, display_question, final_result, thoughts)
        except HTTPError as exc:
            self._relay_error(exc.code, exc.read(), exc.headers.get("Content-Type"))
        except (URLError, TimeoutError) as exc:
            self._json(502, {"detail": f"智能问数服务连接失败：{exc}"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            self._json(500, {"detail": str(exc)})
        finally:
            self.close_connection = True

    def _recommend(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            source = json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")
            question = str(source.get("question") or "").strip()
            if not question:
                self._json(400, {"detail": "问题不能为空"})
                return
            if not RECOMMENDATION_AGENT_ID:
                self._json(503, {"detail": "尚未配置问题推荐工作流ID"})
                return
            payload = {
                "agent_id": RECOMMENDATION_AGENT_ID,
                "start_inputs": {"question": question},
            }
            request = Request(
                f"{PLATFORM_URL}/api/agent/agent_run_json",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Authorization": f"Bearer {self._get_access_token()}", "Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
            self._json(200, {"status": 200, "msg": "ok", "result": result.get("result", result)})
        except HTTPError as exc:
            self._relay_error(exc.code, exc.read(), exc.headers.get("Content-Type"))
        except Exception as exc:
            self._json(500, {"detail": str(exc)})


    def _run_local_forecast(self, source: dict, question: str) -> None:
        """本地联调场景3；上服务器后可切换为工作流模式。"""
        from forecast_service import build_forecast
        session_id = source.get("session_id") or f"local-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        question_id = f"local-question-{uuid.uuid4().hex[:12]}"
        thoughts = []
        self._sse_headers()
        self._sse_event("session_created", {
            "session_id": session_id,
            "question_id": question_id,
        })
        steps = [
            ("forecast-intent", "intelligent_data_forecast_intent_tool", "识别预测意图与目标周期"),
            ("forecast-dataset", "intelligent_data_forecast_dataset_tool", "加载预测历史数据"),
            ("forecast-model", "intelligent_data_forecast_model_tool", "计算斜率、历史增量和预测区间"),
        ]
        result = None
        for node_id, tool, message in steps:
            self._sse_event("node_start", {"node_id": node_id, "tool": tool})
            if tool == "intelligent_data_forecast_model_tool":
                result = build_forecast(question)
                compact = {
                    "status": "success",
                    "scene": "forecast",
                    "message": "预测计算和回测已完成",
                    "model_name": result["model_info"]["name"],
                    "backtest_mae": result["national"]["backtest_mae"],
                }
            elif tool == "intelligent_data_forecast_dataset_tool":
                compact = {
                    "status": "success",
                    "message": message,
                    "history_rows": 185,
                    "age_rows": 925,
                }
            else:
                compact = {
                    "status": "success",
                    "message": message,
                    "target_year": 2026,
                    "target_week": 30,
                }
            self._sse_event("node_complete", {
                "node_id": node_id,
                "tool": tool,
                "result": compact,
            })
            thoughts.append({"node": node_id, "tool": tool, "output": _thought_output(tool, compact)})
        self._sse_event("workflow_complete", {"result": result})
        try:
            save_turn(
                self._history_identity(), session_id, question_id,
                str(source.get("display_question") or question).strip(), result, thoughts,
            )
        except Exception:
            # 本地演示允许未配置历史数据库；不影响预测结果展示。
            pass

    def _sse_headers(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write((":" + " " * 2048 + "\n\n").encode("utf-8"))
        self.wfile.flush()

    def _sse_event(self, event_name: str, value: dict) -> None:
        block = (
            f"event: {event_name}\n"
            f"data: {json.dumps(value, ensure_ascii=False, default=str)}\n\n"
        ).encode("utf-8")
        self.wfile.write(block)
        self.wfile.flush()

    @staticmethod
    def _get_access_token() -> str:
        if not USERNAME or not PASSWORD or not TENANT_NAME:
            raise RuntimeError("请配置智能问数平台认证环境变量")
        body = json.dumps({
            "username": USERNAME,
            "password": PASSWORD,
            "tenantName": TENANT_NAME,
        }, ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{PLATFORM_URL}/admin-api/auth/login-without-captcha",
            data=body,
            headers={"Content-Type": "application/json;charset=UTF-8"},
            method="POST",
        )
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
        token = (result.get("data") or {}).get("access_token")
        if not token:
            raise URLError(result.get("msg") or "平台认证失败")
        return token

    def _json(self, status: int, value: dict):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(payload)

    def _relay_error(self, status: int, payload: bytes, content_type: str | None):
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(payload)


def main():
    server = ThreadingHTTPServer((HOST, PORT), IntelligentDataHandler)
    print(f"智能问数独立服务已启动：http://127.0.0.1:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except OSError as exc:
        print(f"启动失败：{exc}", file=sys.stderr)
        sys.exit(1)
