-- schema.sql —— D4-1：在 agent_lab 库建 sessions 表
-- 用法（从 backend/ 目录）：
--   docker exec -i mysql8 mysql -uroot -proot agent_lab < schema.sql
-- 或：在 Navicat 打开 agent_lab，把下面 SQL 粘进"新建查询"窗口执行

CREATE TABLE IF NOT EXISTS sessions (
    id         VARCHAR(64)  PRIMARY KEY,   -- 存前端的 conversation_id（也是 LangGraph 的 thread_id）
    title      VARCHAR(100) NOT NULL DEFAULT '未命名会话',  -- 会话标题
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 创建时间（自动填）
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP   -- 更新时间（每次改行自动更新）
);
