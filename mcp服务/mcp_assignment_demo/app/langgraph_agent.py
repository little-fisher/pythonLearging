"""LangGraph Agent：把远程 MCP Server 暴露的 Tools 交给 DeepSeek 调用。"""

import argparse
import asyncio
import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.core.config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    MCP_SERVER_URL,
)
from app.core.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是课程助教。
当用户询问学员作业上交情况、提交名单或作业要求时，必须调用 MCP Tool，不能猜测数据。
拿到 Tool 结果后，用简洁中文回答；若没有记录，提示用户核对姓名与期数。"""


def build_model() -> ChatOpenAI:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY，请先复制 .env.example 为 .env 并填写密钥。")

    logger.info("创建 DeepSeek 模型客户端: model=%s, base_url=%s", DEEPSEEK_MODEL, DEEPSEEK_BASE_URL)
    return ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        temperature=0,
    )


async def ask_agent(question: str) -> str:
    """连接 MCP，加载 Tools，并让 LangGraph 执行模型与工具的循环。"""
    logger.info("[1/5] 收到用户问题: %s", question)
    logger.info("[2/5] 连接 MCP Server: %s", MCP_SERVER_URL)
    client = MultiServerMCPClient(
        {
            "assignment-tools": {
                "transport": "http",
                "url": MCP_SERVER_URL,
            }
        }
    )
    tools = await client.get_tools()
    logger.info("[3/5] 已加载 MCP Tools: %s", tools)
    logger.info("[3/5] 已加载 MCP Tools: %s", [tool.name for tool in tools])
    agent = create_react_agent(build_model(), tools)

    logger.info("[4/5] LangGraph 开始执行 Agent 与 Tool 调用循环")
    result = await agent.ainvoke(
        {
            "messages": [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=question),
            ]
        }
    )
    for message in result["messages"]:
        if isinstance(message, AIMessage) and message.tool_calls:
            logger.info("模型选择 MCP Tool: %s", message.tool_calls)
        if isinstance(message, ToolMessage):
            logger.info("MCP Tool 返回结果: %s", message.content)

    answer = result["messages"][-1].content
    logger.info("[5/5] Agent 最终回复: %s", answer)
    return answer


def main() -> None:
    parser = argparse.ArgumentParser(description="使用 LangGraph 调用 MCP 服务")
    parser.add_argument(
        "question",
        nargs="?",
        default="朱艺第三期作业提交了吗？",
        help="要交给 Agent 的问题",
    )
    args = parser.parse_args()
    print(asyncio.run(ask_agent(args.question)))


if __name__ == "__main__":
    main()
