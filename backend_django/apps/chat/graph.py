# graph.py —— Agent 定义：模型 + MCP 工具 + MySQL 记忆

import asyncio
import os
import sys
from pathlib import Path

import pymysql
from django.conf import settings
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_deepseek import ChatDeepSeek
from langgraph.checkpoint.mysql.aio import AIOMySQLSaver
from langchain_mcp_adapters.client import MultiServerMCPClient

# ---- 1. 模型与提示词 ----
MODEL = settings.DEEPSEEK_MODEL
SYSTEM_PROMPT = "你是一个专业的助手"

model = ChatDeepSeek(model_name=MODEL, api_key=settings.DEEPSEEK_API_KEY)

DB_URI = f"mysql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"

# ---- 2. MCP 工具加载（含递归防护）----
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # backend_django/ 目录

if os.environ.get("MCP_SERVER_MODE") == "1":
    # 当前进程是 MCP server 自己：跳过连接，否则 django.setup → import 本文件
    # → 又拉起一个 MCP server 子进程，无限递归
    tools = []
else:
    # 拉起子进程跑 mcp_server.server，通过 stdin/stdout 用 JSON-RPC 通信
    client = MultiServerMCPClient({
        "chat-tools": {
            "transport": "stdio",
            "command": sys.executable,
            "args": ["-m", "mcp_server.server"],
            "cwd": str(PROJECT_ROOT),
        }
    })
    # get_tools() 是异步的；此处是模块加载（同步上下文），用 asyncio.run 桥接
    tools = asyncio.run(client.get_tools())

# ---- 3. agent 工厂：同步/异步 saver 共用同一份定义 ----
def build_agent(checkpointer):
    return create_agent(
        model=model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=checkpointer,
    )

# ---- 4.  两个异步入口  ----
# 异步跑对话：chat 视图用（MCP 工具只有异步实现，整条链必须异步）
async def run_agent(message: str, thread_id: str):
    """每次请求独立建异步 checkpointer（aiomysql 连接绑定事件循环，不能跨请求复用）。"""
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        agent = build_agent(cp)
        return await agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config={"configurable": {"thread_id": thread_id}},
        )

async def read_history(thread_id: str)->list[dict]:
    """读会话快照中的消息列表（原始消息对象，过滤转换交给调用方）。"""
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        agent = build_agent(cp)
        snapshot = await agent.aget_state({"configurable": {"thread_id": thread_id}}) 
        return snapshot.values.get("messages", []) if snapshot and snapshot.values else []
