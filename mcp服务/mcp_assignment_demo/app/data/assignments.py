"""课堂演示数据：后续可替换为 Django ORM、SQLAlchemy 或外部 API。"""

ASSIGNMENTS = [
    {"student": "朱艺", "phase": 1, "submitted": True, "file_count": 17, "notes": "前端、后端、文档、数据库相关、依赖/配置"},
    {"student": "胡秋", "phase": 1, "submitted": True, "file_count": 32, "notes": "前端、后端、文档、运行产出、数据库相关、依赖/配置"},
    {"student": "巩建康", "phase": 3, "submitted": True, "file_count": 28, "notes": "前端、后端、文档、数据库相关、依赖/配置"},
    {"student": "黄枫萍", "phase": 3, "submitted": True, "file_count": 24, "notes": "后端、数据库相关、依赖/配置"},
    {"student": "朱艺", "phase": 3, "submitted": True, "file_count": 49, "notes": "前端、后端、数据库相关、依赖/配置"},
]

PHASE_REQUIREMENTS = {
    7: "实现一个学员作业查询 MCP 服务：至少包含 1 个 Tool，参数需要类型说明与校验。",
}
