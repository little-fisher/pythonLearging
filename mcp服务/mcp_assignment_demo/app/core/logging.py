"""统一日志配置：日志输出到 stderr，避免污染 MCP stdio 协议输出。"""

import logging
import sys

from decouple import config


def configure_logging() -> None:
    level_name = config("LOG_LEVEL", default="INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        stream=sys.stderr,
    )
