import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def get_db_connection() -> mysql.connector.MySQLConnection:
    """获取数据库连接"""
    return mysql.connector.connect(
        host = os.getenv("DB_HOST", "127.0.0.1"),
        port = int(os.getenv("DB_PORT", 3306)),
        user = os.getenv("DB_USER", "root"),
        password = os.getenv("DB_PASSWORD", "root"),
        database = os.getenv("DB_NAME", "agent_lab"),
    )