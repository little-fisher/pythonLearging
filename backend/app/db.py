
import mysql.connector
from decouple import config

def get_db_connection() -> mysql.connector.MySQLConnection:
    """获取数据库连接"""
    return mysql.connector.connect(
        host = config("DB_HOST", default="127.0.0.1"),
        port = config("DB_PORT", default=3306, cast=int),
        user = config("DB_USER", default="root"),
        password = config("DB_PASSWORD", default="root"),
        database = config("DB_NAME", default="agent_lab"),
    )