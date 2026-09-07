# graph.py —— Agent 定义：模型 + MCP 工具 + MySQL 记忆

import asyncio
import os
import sys
from pathlib import Path
from .skills_loader import list_skills
import pymysql
from django.conf import settings
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, AIMessage
from langchain_deepseek import ChatDeepSeek
from langgraph.checkpoint.mysql.aio import AIOMySQLSaver
from langchain_mcp_adapters.client import MultiServerMCPClient
from typing import Literal, TypedDict
from langgraph.graph import END, START, StateGraph

# ---- 1. 模型与提示词 ----
MODEL = settings.DEEPSEEK_MODEL
SYSTEM_PROMPT = "你是一个专业的助手"

def build_system_prompt()->str:
    skills = list_skills()
    if not skills:
        return SYSTEM_PROMPT
    listing = "\n".join(f"- {s['name']}: {s['description']}" for s in skills)
    return (
    SYSTEM_PROMPT
    + "\n\n你可以使用以下技能。当用户请求匹配某个技能的描述时，先调用 load_skill 工具获取完整工作说明，再按说明执行：\n"
    + listing
    )

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
def build_agent(checkpointer,  system_prompt: str = None):
    return create_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt or build_system_prompt(),
        checkpointer=checkpointer,
    )

# --- 3.4. 状态定义 ----
class ChatState(TypedDict):
    """一次聊天请求在条件图中的状态。"""

    message: str
    thread_id: str
    result: dict | None

# --- 3.5. 入口路由 ----
def route_request(state: ChatState)->Literal['help','agent']:
    """系统命令走快速通道，其他消息交给 Agent。"""
    message = state["message"].strip().lower()
    if message in ("/help", "/skills"):
        return "help"

    return "agent"

# 字符串拼接返回前端的显示内容
async def help_node(state: ChatState)->dict:
    """直接返回当前 Agent 的能力列表，不调用大模型。"""
    skills = list_skills()
    lines = [
        "我是一个支持多轮对话和工具调用的助手。",
        "",
        "当前支持的基础能力：",
        "- 查询当前时间",
        "- 搜索已有会话",
        "- 读取指定会话的历史消息",
    ]
    if skills:
        lines.extend(
            [
                "",
                "当前可用技能：",
            ]
        )
        for skill in skills:
            lines.append(
                f"- {skill['name']}：{skill['description']}"
            )
        lines.extend(
            [
                "",
                "你可以直接输入问题，"
                "我会根据需要自动选择合适的工具。",
            ]
        )
        content = "\n".join(lines)
        # 保持与 Agent 返回值相同的基本结构，
        # 让 Django 视图不需要判断当前走了哪个分支。
        return {
            "result": {
                "messages": [
                    AIMessage(content=content),
                ]
            }
        }

async def agent_node(state: ChatState) -> dict:
    """运行带有 MySQL Checkpointer 的普通 Agent。"""
    message = state["message"]
    thread_id = state["thread_id"]
    # 每次请求独立创建异步 Checkpointer，
    # 避免 aiomysql 连接跨事件循环复用。
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        prompt = (
            build_system_prompt()
            + f"\n\n当前会话 ID：{thread_id}"
            + "（用户说“这个会话”或“本次对话”时，"
            + "使用此 ID 调用 get_session_history）"
        )
        agent = build_agent(
            checkpointer=cp,
            system_prompt=prompt,
        )
        result = await agent.ainvoke(
            {
                "messages": [
                    HumanMessage(content=message),
                ]
            },
            config={
                "configurable": {
                    "thread_id": thread_id,
                }
            },
        )
    return {
        "result": result,
    }

# --- 3.6. 状态图 ----
chat_builder = StateGraph(ChatState)
chat_builder.add_node(
    "help_node",
    help_node,
)

chat_builder.add_node(
    "agent_node",
    agent_node,
)

# 根据 route_request 的返回值选择节点。
chat_builder.add_conditional_edges(
    START,
    route_request,
    {
        "help": "help_node",
        "agent": "agent_node",
    },
)
chat_builder.add_edge("help_node", END)
chat_builder.add_edge("agent_node", END)

# 外层图只负责路由，持久化由 agent_node 内部负责。
chat_graph = chat_builder.compile()

# ---- 4.  两个异步入口  ----
# 异步跑对话：chat 视图用（MCP 工具只有异步实现，整条链必须异步）
async def run_agent(message: str, thread_id: str):
    """运行聊天条件图并返回最终结果。"""
    final_state = await chat_graph.ainvoke(
        {
            "message": message,
            "thread_id": thread_id,
            "result": None,
        }
    )

    return final_state["result"]

async def read_history(thread_id: str)->list[dict]:
    """读会话快照中的消息列表（原始消息对象，过滤转换交给调用方）。"""
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        agent = build_agent(cp)
        snapshot = await agent.aget_state({"configurable": {"thread_id": thread_id}}) 
        return snapshot.values.get("messages", []) if snapshot and snapshot.values else []
