"""Agent 定义副本：在原有 Checkpointer 聊天上增加系统命令条件分支。"""

import asyncio
import os
import sys
from pathlib import Path
from typing import Literal, TypedDict

from django.conf import settings
from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_deepseek import ChatDeepSeek
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.mysql.aio import AIOMySQLSaver
from langgraph.graph import END, START, StateGraph

from .skills_loader import list_skills


# ---- 1. 模型与提示词 ----

MODEL = settings.DEEPSEEK_MODEL
SYSTEM_PROMPT = "你是一个专业的助手"


def build_system_prompt() -> str:
    """根据当前可用技能构建系统提示词。"""
    skills = list_skills()
    if not skills:
        return SYSTEM_PROMPT

    listing = "\n".join(
        f"- {skill['name']}: {skill['description']}" for skill in skills
    )
    return (
        SYSTEM_PROMPT
        + "\n\n你可以使用以下技能。"
        + "当用户请求匹配某个技能的描述时，"
        + "先调用 load_skill 工具获取完整工作说明，再按说明执行：\n"
        + listing
    )


model = ChatDeepSeek(
    model_name=MODEL,
    api_key=settings.DEEPSEEK_API_KEY,
)

DB_URI = (
    f"mysql://{settings.DB_USER}:{settings.DB_PASSWORD}"
    f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
)


# ---- 2. MCP 工具加载（含递归防护）----

PROJECT_ROOT = Path(__file__).resolve().parents[2]

if os.environ.get("MCP_SERVER_MODE") == "1":
    # MCP server 进程不再启动子 MCP server，避免递归创建进程。
    tools = []
else:
    client = MultiServerMCPClient(
        {
            "chat-tools": {
                "transport": "stdio",
                "command": sys.executable,
                "args": ["-m", "mcp_server.server"],
                "cwd": str(PROJECT_ROOT),
            }
        }
    )
    # get_tools() 是异步方法，模块加载阶段用 asyncio.run 桥接。
    tools = asyncio.run(client.get_tools())


# ---- 3. Agent 工厂 ----

def build_agent(checkpointer, system_prompt: str | None = None):
    """使用统一的模型、工具和系统提示词创建 Agent。"""
    return create_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt or build_system_prompt(),
        checkpointer=checkpointer,
    )


# ---- 4. 外层聊天条件图 ----

class ChatState(TypedDict):
    """一次聊天请求在外层条件图中传递的状态。"""

    message: str
    thread_id: str
    result: dict | None


def route_request(state: ChatState) -> Literal["help", "agent"]:
    """系统命令走快速通道，其他消息交给 Agent。"""
    message = state["message"].strip().lower()
    if message in ("/help", "/skills"):
        return "help"
    return "agent"


async def help_node(state: ChatState) -> dict:
    """直接返回当前能力列表，不调用大模型。"""
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
        lines.extend(["", "当前可用技能："])
        for skill in skills:
            lines.append(f"- {skill['name']}：{skill['description']}")

    lines.extend(
        [
            "",
            "你可以直接输入问题，我会根据需要自动选择合适的工具。",
        ]
    )

    # 和 Agent 返回值保持相同的 messages 结构，调用方无需区分分支。
    return {
        "result": {
            "messages": [AIMessage(content="\n".join(lines))],
        }
    }


async def agent_node(state: ChatState) -> dict:
    """处理普通聊天，保留原有 MySQL Checkpointer 和 MCP 工具调用。"""
    message = state["message"]
    thread_id = state["thread_id"]

    # aiomysql 连接绑定事件循环，每次请求独立创建 Checkpointer。
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        prompt = (
            build_system_prompt()
            + f"\n\n当前会话 ID：{thread_id}"
            + "（用户说‘这个会话/本次对话’时，"
            + "用此 ID 调用 get_session_history）"
        )
        agent = build_agent(cp, system_prompt=prompt)
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config={"configurable": {"thread_id": thread_id}},
        )

    return {"result": result}


chat_builder = StateGraph(ChatState)
chat_builder.add_node("help_node", help_node)
chat_builder.add_node("agent_node", agent_node)

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

# 外层图只负责路由，聊天持久化仍由 agent_node 管理。
chat_graph = chat_builder.compile()


# ---- 5. Django 视图使用的异步入口 ----

async def run_agent(message: str, thread_id: str):
    """执行聊天条件图并返回统一结果。"""
    final_state = await chat_graph.ainvoke(
        {
            "message": message,
            "thread_id": thread_id,
            "result": None,
        }
    )
    return final_state["result"]


async def read_history(thread_id: str) -> list:
    """读取会话快照中的消息列表。"""
    async with AIOMySQLSaver.from_conn_string(DB_URI) as cp:
        agent = build_agent(cp)
        snapshot = await agent.aget_state(
            {"configurable": {"thread_id": thread_id}}
        )
        if snapshot and snapshot.values:
            return snapshot.values.get("messages", [])
        return []
