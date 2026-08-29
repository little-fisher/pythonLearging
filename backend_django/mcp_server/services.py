import logging
logger = logging.getLogger(__name__)
from datetime import datetime


def current_time() -> str:
    result = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info(f"返回当前时间：{result}")
    return result