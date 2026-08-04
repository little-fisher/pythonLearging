# 第二期学习计划：数据库与中间件（MySQL + Redis + RabbitMQ）

> 来源：`第二期_数据库与中间件.pptx`（15 页）
> 一句话目标：把 MySQL、Redis、RabbitMQ 三件套真接进一个后端接口，最后做成**最小可运行的聊天后端**。
> 本计划已按你的实际栈（**FastAPI + pymysql + Docker**）适配，PPT 里的 Django/Celery 示例对应换成 FastAPI/pika。

---

## 0. 这期结束时你要能回答 PPT 首页的 4 个问题

1. MySQL、Redis、RabbitMQ 各自负责什么？
2. 聊天系统里什么该进库，什么该进缓存？
3. 什么场景必须走异步队列？
4. 这一期结束后，你能自己搭出什么？

对照检查：`docs/API-CONTRACT.md` 里那条"一条消息为什么落 MySQL、什么时候读 Redis、什么任务要丢 RabbitMQ"。

---

## 1. 环境准备（先跑通，别等写业务再补）

你已有 Docker + MySQL（`mysql8`，3306）。这期再补两个容器：

```bash
# Redis：端口 6379
docker run -d --name redis7 -p 6379:6379 redis:7

# RabbitMQ（带管理面板）：端口 5672(amqp) + 15672(web)
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

启动顺序（机器重启后）：`open -a Docker` 等就绪 → `docker start mysql8 redis7 rabbitmq`

验证：
- Redis：`docker exec -it redis7 redis-cli ping` → `PONG`
- RabbitMQ 管理面板：浏览器开 `http://localhost:15672`（默认 `guest/guest`）

依赖（装进 `backend/.venv`）：
```bash
pip install redis pika
```
`requirements.txt` 加 `redis` 和 `pika`。

---

## 2. 六个模块（对应 PPT 第 13 页）

### 模块 1：MySQL 表结构与基础 SQL（PPT 4–7 页）

**要掌握的**
- DDL / DML / DQL / DCL 四种分类各自管什么
- 建库：`CREATE DATABASE chat_db CHARACTER SET utf8mb4;`
- 建表：主键、时间字段、索引为什么重要
- 改结构：`ALTER TABLE ... ADD COLUMN`；删：`DROP`
- 你已会的基础（sessions 表的建/查/删），这次补"建消息表 + 索引"

**动手练习**
1. 在 `backend/schema.sql` 里加一张消息表（PPT 作业要求的最小字段）：

```sql
CREATE TABLE IF NOT EXISTS chat_message (
    id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(64)  NOT NULL,
    role       VARCHAR(20)  NOT NULL,
    content    TEXT         NOT NULL,
    status     VARCHAR(20)  NOT NULL DEFAULT 'sent',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_session (session_id)   -- 按会话查历史的索引
);
```
2. 练习 `INSERT` / `SELECT ... WHERE session_id=? ORDER BY created_at DESC` / `ALTER TABLE` / `DROP`（在 Navicat 或 mysql 命令行里敲，别只背）。
3. 权限：`GRANT SELECT, INSERT ON agent_lab.chat_message TO 'student'@'%';`（了解一下 DCL 即可）

**验收**
- 能在 `agent_lab` 里建出 `chat_message` 表，插入 3 行，按 session 查出并按时间倒序
- 能说清"为什么 `session_id` 要加索引"（回答：WHERE 过滤靠它，否则全表扫）

---

### 模块 2：事务管理与一致性（PPT 8 页）

**要掌握的**
- `START TRANSACTION` / `COMMIT` / `ROLLBACK` 三兄弟
- 为什么需要事务：一组强关联操作不能"成功一半"
- 事务的直觉 ≠ 语法：保证一组数据改动的一致性

**动手练习**
1. 在 `agent_lab` 建一张 `account` 表（id, balance），用 PPT 的转账例子跑通：
   - 正常路径：扣 100 + 加 100 → `COMMIT`
   - 故意在第 2 步前面加一行报错 → `ROLLBACK`，验证余额没变
2. 对照你的项目找"该不该用事务"：`INSERT IGNORE sessions` + 写消息这两步，如果只成功一半会怎样？（结论：会话名片和消息最好同一事务，或至少理解为什么）

**验收**
- 能复述"COMMIT 提交、ROLLBACK 回滚"并演示一次回滚后数据未变
- 能在你的聊天接口里指出"哪几行写库逻辑其实应该包一个事务"

---

### 模块 3：聊天记录查询与更新（PPT 4、7 页延伸）

**要掌握的**
- 按 session 查历史、按时间排序、按条件过滤
- "什么时候 UPDATE、什么时候只 APPEND"（消息基本只追加，状态字段才更新）
- 上节课的 LEFT JOIN / RIGHT JOIN 在查询里的实战

**动手练习**
1. 在 FastAPI 加一个只读接口（或临时脚本）：从 `chat_message` 按 `session_id` 拉历史，转成前端要的 `[{role, content}]` 格式（你 `main.py` 里 `get_conversation_messages` 现在读的是 Checkpointer，这次让它也能读 MySQL 表，二选一验证即可）。
2. 写一个"标记已读"的 UPDATE：`UPDATE chat_message SET status='read' WHERE session_id=? AND status='sent'`。
3. 试试 `LEFT JOIN`：查"所有会话 + 每个会话消息条数"，主表 `sessions` 放左边。

**验收**
- 能从 MySQL 表把某会话历史按时间倒序查回来
- 能 UPDATE 状态字段，且知道"消息正文绝不 UPDATE，只 APPEND"

---

### 模块 4：Redis key 设计与过期策略（PPT 9、12 页）

**要掌握的**
- Redis 是**内存 KV + 过期**，不是永久存储
- 常用命令：`SET` / `GET` / `EXPIRE` / `HSET` / `LPUSH`
- Key 设计：`chat:session:{id}` 这类带冒号的命名空间
- 什么进 Redis、什么进 MySQL（呼应你之前问的"为什么不用 Redis 存全部"）

**动手练习**
1. `redis-cli` 手敲一遍 PPT 第 9 页命令：`SET chat:session:1001 "..."`、`EXPIRE ... 1800`、`HSET user:1001 profile name "Tom"`、`LPUSH recent:questions "..."`。
2. 在 FastAPI 里用 `redis` 库写一个小函数：把某个会话**最近几轮消息**缓存进 Redis（`LPUSH` + `LTRIM` 只留最近 N 条），设 `EXPIRE 1800`；查询时先读缓存，没有再查 MySQL（缓存旁路模式）。

**验收**
- 能说清"会话上下文/验证码/热点结果为什么进 Redis，聊天记录为什么必须进 MySQL"
- 能跑通"先查 Redis，miss 再查 MySQL"并正确设置过期时间

---

### 模块 5：RabbitMQ 生产者与消费者（PPT 9、11、12 页）

**要掌握的**
- 生产者 / 队列 / 消费者三件套
- 什么该同步做（用户等着看的），什么该异步做（通知/统计/回调/审计）
- RabbitMQ vs Redis 当消息队列的取舍（PPT 12 页五维度对比）
- 用 `pika` 直接连（demo 不一定要上 Celery）

**动手练习**
1. 用 `pika` 写一个最小 producer：发一条消息到队列 `chat.notify`；再写一个 consumer：打印收到的消息并 `ack`。
2. 把"发消息后的通知/统计"拆成异步：接口里 `publish` 一条任务（比如 `{"session_id":..., "action":"notify"}`），接口立刻返回，consumer 在后台打印"已处理通知"。

**验收**
- 能跑通 producer→consumer，消息被消费且 `ack`
- 能说出"为什么通知/统计不该阻塞接口返回"

---

### 模块 6：综合实践 = PPT 课后作业（PPT 15 页）

把三件事串成一个**最小聊天接口**（这就是 PPT 的作业）：

```
用户发消息
  → 接口先返回
  → 消息写入 MySQL（chat_message）
  → 最近几轮会话写 Redis（带 EXPIRE）
  → 任务投到 RabbitMQ（chat.notify）
  → 消费者异步处理（打印/统计/审计）
```

**动手练习（按 PPT 作业三条）**
1. **建表**：`chat_message` 含 `session_id / role / content / status / created_at`（模块 1 已建）
2. **做缓存**：Redis 保存当前会话最近几轮消息 / 临时状态，设合理过期（模块 4 已做）
3. **接队列**：写 MySQL + 读 Redis + 发 RabbitMQ 消息，消费者处理一个异步任务（模块 5 已做）
4. 把上面串成 `main.py` 里 `/api/chat` 的一个新分支（如 `context_mode="phase2"`），前端能调通

**验收（最终）**
- 浏览器发一条消息 → MySQL 落库、Redis 有缓存、RabbitMQ 消费日志出现异步处理记录
- 能完整回答 PPT 首页 4 个问题，并画出一条消息的完整流转图

---

## 3. 学习节奏建议

| 阶段 | 内容 | 预计 |
|---|---|---|
| 第 1 天 | 环境准备 + 模块 1（MySQL 建表/CRUD）+ 模块 2（事务） | 半天 |
| 第 2 天 | 模块 3（查询/更新）+ 模块 4（Redis） | 半天 |
| 第 3 天 | 模块 5（RabbitMQ）+ 模块 6（综合串起来） | 半天 |

（按你的节奏可拉长，重点是**每个模块都有可验收的结果**，不是看完就过。）

---

## 4. 关键提醒

- **别把三件套分开背**，重点是想清楚"这条数据现在最适合待在哪里"（PPT 第 9 页原话）
- 这一期是在**你已有的 FastAPI 聊天项目上长能力**，不是重开新项目：MySQL 你已经有了，把 Redis/RabbitMQ 接进 `/api/chat` 就是全部目标
- 环境变量照旧走 `.env` + `python-decouple`（`REDIS_URL`、`RABBITMQ_URL` 可加进去）
- 每完成一个模块，可以在本文件对应项打勾；做完模块 6 就是 PPT 课后作业完成 ✅
