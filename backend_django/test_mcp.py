"""MCP 客户端测试脚本（脚手架，不是作业本体）。

用法（在 backend_django/ 目录下）：
  .venv/bin/python test_mcp.py                                # 列出所有工具
  .venv/bin/python test_mcp.py get_current_time               # 调用无参工具
  .venv/bin/python test_mcp.py search_sessions '{"keyword": "Redis"}'
  .venv/bin/python test_mcp.py get_history '{"session_id": "http-002"}'
"""

import asyncio
import json
import sys

from langchain_mcp_adapters.client import MultiServerMCPClient

MCP_SERVER_URL = "http://127.0.0.1:8002/mcp"


async def main():
    client = MultiServerMCPClient(
        {"chat-tools": {"transport": "http", "url": MCP_SERVER_URL}}
    )
    tools = {t.name: t for t in await client.get_tools()}
    if len(sys.argv) == 1:
        print("tools:", list(tools))
        return
    name = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    print(await tools[name].ainvoke(args))


if __name__ == "__main__":
    asyncio.run(main())
