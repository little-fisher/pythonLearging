import logging
from mcp.server.fastmcp import FastMCP
from mcp_server.services import current_time


logging.basicConfig(
    level=logging.INFO,
     format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

mcp = FastMCP(
    "chat-tools",
    instructions="聊天项目的跨会话检索工具：搜会话、看历史、查时间",
    host = '127.0.0.1',
    port = 8002,
)

@mcp.tool(
    description = (
        "返回服务器当前时间。"
        "适用于：现在几点、今天日期、当前时间等任何时间问题。"
    )
)
def get_current_time() -> str:
    """返回当前时间的字符串表示"""
    return current_time()

if __name__ == "__main__":
    mcp.run(transport="streamable-http")