"""LangGraph Agent：通过 stdio 自动启动本地 MCP Server 并调用 Tools。"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

from app.core.logging import configure_logging
from app.langgraph_agent import SYSTEM_PROMPT, build_model

configure_logging()
logger = logging.getLogger(__name__)

# app/ 的上一级就是项目根目录，供子进程正确导入 app.server。
PROJECT_ROOT = Path(__file__).resolve().parent.parent


async def ask_agent(question: str) -> str:
    """通过 stdio 连接本地 MCP Server，交给 LangGraph 处理问题。"""
    logger.info("[1/5] 收到用户问题: %s", question)
    logger.info("[2/5] 启动本地 MCP Server: %s -m app.server", sys.executable)

    client = MultiServerMCPClient(
        {
            "assignment-tools": {
                "transport": "stdio",
                "command": sys.executable,
                "args": ["-m", "app.server"],
                "cwd": str(PROJECT_ROOT),
            }
        }
    )

    # 0.1.0 版本会在获取工具及每次 Tool 调用时自行管理 Stdio 会话。
    tools = await client.get_tools()
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
    parser = argparse.ArgumentParser(description="使用 LangGraph 通过 stdio 调用本地 MCP 服务")
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
