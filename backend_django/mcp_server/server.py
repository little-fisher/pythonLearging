import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("MCP_SERVER_MODE", "1")
django.setup()

from mcp.server.fastmcp import FastMCP
from apps.chat.services import get_current_time as get_current_time_impl, search_sessions as search_sessions_impl, get_session_history as get_session_history_impl
from asgiref.sync import sync_to_async
from apps.chat.skills_loader import load_skill_body as load_skill_body_impl

mcp = FastMCP(
    "chat-tools",
    instructions="提供检索与历史查询工具：按关键词搜会话、读取会话历史、获取当前时间",
)

@mcp.tool(
    description="获取当前日期时间。适用于：用户问现在几点、今天日期、需要感知当前时间的场景。无需参数。",
)
def get_current_time() -> str:
    """获取当前时间。"""
    return  get_current_time_impl()


@mcp.tool(
    description="按关键词搜索会话。适用于：用户需要根据会话标题快速定位的场景。参数：keyword",
)
async def search_sessions(keyword: str) -> list[dict]:
    """按关键词搜索会话。"""
    return await sync_to_async(search_sessions_impl)(keyword)


@mcp.tool(
    description="读取指定会话的历史消息。适用于：用户想回顾某个会话的具体聊天内容。通常先用 search_sessions 按关键词搜到 session_id，再调用本工具。参数：session_id（字符串，来自 search_sessions 返回的 id）。",
)
async def get_session_history(session_id: str) -> list[dict]:
    """读取指定会话的历史消息。"""
    return await sync_to_async(get_session_history_impl)(session_id)


@mcp.tool(
    description="加载指定技能的完整工作说明。当用户请求匹配系统提示中列出的某个技能时，先调用本工具获取该技能的工作规则再执行。参数：skill_name（技能名，见系统提示中的可用技能列表）",
)
def load_skill(skill_name: str) -> dict:
    """加载指定技能的完整工作说明。"""
    return load_skill_body_impl(skill_name)

if __name__ == "__main__":
    mcp.run()


