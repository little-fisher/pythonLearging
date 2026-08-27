"""LangGraph Agent 的运行配置。"""

from decouple import config

DEEPSEEK_API_KEY = config("DEEPSEEK_API_KEY", default="")
DEEPSEEK_BASE_URL = config("DEEPSEEK_BASE_URL", default="https://api.deepseek.com")
DEEPSEEK_MODEL = config("DEEPSEEK_MODEL", default="deepseek-chat")
MCP_SERVER_URL = config("MCP_SERVER_URL", default="http://127.0.0.1:8001/mcp")

