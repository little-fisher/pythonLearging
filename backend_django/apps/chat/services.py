import asyncio
from datetime import datetime
from .models import Session
from .graph import read_history

def get_current_time() -> str:
    """获取当前时间。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def search_sessions(keyword: str) -> list[dict]:
    """按关键词搜索会话。"""
    sessions = Session.objects.filter(title__icontains=keyword).values('id', 'title', 'created_at', 'updated_at')
    return list(sessions)

def get_session_history(session_id: str) -> list[dict]:
    """读取指定会话的历史消息。"""
    messages = asyncio.run(read_history(session_id))
    return [
        {
            'role': 'user' if m.type == 'human' else 'assistant',
            'content': m.content
        }
        for m in messages
        if m.type in ('human', 'ai')
    ]
