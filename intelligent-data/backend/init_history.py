#!/usr/bin/env python3
"""仅在指定业务库创建/校验新版智能问数会话表和轮次表。"""
from __future__ import annotations

import argparse
import getpass
from pathlib import Path

import pymysql


DEFAULT_DATABASE = "influenza_surveillance"
TABLES = ("intelligent_data_sessions", "intelligent_data_turns")


def main() -> int:
    parser = argparse.ArgumentParser(description="创建新版智能问数会话表和轮次表")
    parser.add_argument("--host", default="101.43.59.73")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="root")
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    args = parser.parse_args()
    password = getpass.getpass(f"MySQL密码（{args.user}@{args.host}）：")
    ddl = (Path(__file__).with_name("init_history.sql")).read_text(encoding="utf-8")
    connection = pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=password,
        database=args.database,
        charset="utf8mb4",
        autocommit=False,
        connect_timeout=10,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT DATABASE()")
            current_database = cursor.fetchone()[0]
            if current_database != args.database:
                raise RuntimeError(f"目标库校验失败：{current_database}")
            statements = [statement.strip() for statement in ddl.split(";") if statement.strip()]
            for statement in statements:
                cursor.execute(statement)
            cursor.execute(
                """SELECT table_name FROM information_schema.tables
                   WHERE table_schema=%s AND table_name IN (%s,%s)""",
                (args.database, *TABLES),
            )
            created = {row[0] for row in cursor.fetchall()}
            missing = set(TABLES) - created
            if missing:
                raise RuntimeError(f"建表后校验失败，缺少：{','.join(sorted(missing))}")
        connection.commit()
        print(f"创建/校验成功：{args.database}.{TABLES[0]}, {args.database}.{TABLES[1]}")
        print("旧表 intelligent_data_history 未修改。")
        return 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
