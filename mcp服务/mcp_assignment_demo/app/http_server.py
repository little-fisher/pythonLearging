"""标准 MCP Server：Streamable HTTP 传输，适合远程部署与团队共享。"""

from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.routing import Mount

from app.server import mcp


@asynccontextmanager
async def lifespan(_app: Starlette):
    async with mcp.session_manager.run():
        yield


app = Starlette(
    routes=[Mount("/", app=mcp.streamable_http_app())],
    lifespan=lifespan,
)
