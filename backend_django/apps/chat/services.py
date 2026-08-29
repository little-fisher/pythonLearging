
from datetime import datetime
from .models import Session

def get_current_time() -> str:
    """获取当前时间。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def search_sessions(keyword: str) -> list[dict]:
    """按关键词搜索会话。"""
    sessions = Session.objects.filter(title__icontains=keyword).values('id', 'title', 'created_at', 'updated_at')
    return list(sessions)

