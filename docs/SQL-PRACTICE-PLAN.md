# SQL 从零练习计划（配合你的 MySQL 容器）

> 前置：`mysql8` 容器已启动（`docker start mysql8`）
> 目标：7 天把 MySQL 的建表、增删改、查询、聚合、联结、索引、事务过一遍，练完能自己写 `chat_message` 表。
> 这份计划是 `PHASE2-PLAN.md` 模块 1 的前置课。

---

## 0. 怎么练

两种方式任选（推荐先命令行，再配 Navicat 看结果）：

```bash
# 方式 A：容器内命令行（练手感）
docker exec -it mysql8 mysql -uroot -proot

# 方式 B：Navicat 连 127.0.0.1:3306 root/root，建库后照抄 SQL 执行
```

**先把练习库建好**（一次性执行，后面所有练习都用它）：

```sql
CREATE DATABASE IF NOT EXISTS sql_practice CHARACTER SET utf8mb4;
USE sql_practice;

-- 用户表
CREATE TABLE users (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(20) NOT NULL,
    age        INT,
    city       VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 订单表
CREATE TABLE orders (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    user_id    INT,
    amount     DECIMAL(10,2),
    status     VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 种子数据
INSERT INTO users (name, age, city) VALUES
('小林', 24, '上海'), ('阿青', 22, '北京'),
('大熊', 30, '广州'), ('小美', 27, '上海'),
('大伟', 35, '深圳');

INSERT INTO orders (user_id, amount, status) VALUES
(1, 100.00, 'paid'), (1, 50.00, 'pending'),
(2, 200.00, 'paid'), (3, 80.00, 'paid'),
(3, 30.00, 'paid'), (3, 20.00, 'refunded'),
(5, 500.00, 'paid');
```

---

## 阶段 1：认识库和表（DDL）— 第 1 天

**学什么**：库 = 文件夹，表 = 表格，行 = 记录，列 = 字段。

**命令清单**：`SHOW DATABASES;` `USE sql_practice;` `SHOW TABLES;` `DESC users;` `CREATE TABLE ...;` `DROP TABLE ...;` `ALTER TABLE ... ADD COLUMN ...;`

**练习**：
1. `SHOW DATABASES;` — 应能看到 `sql_practice` 和 `agent_lab`
2. `DESC users;` — 观察每一列的类型和约束（`int`/`varchar`/`datetime`/`PRIMARY KEY`）
3. 临时建一张 `test1` 表再 `DROP TABLE test1;`，练"建了删"

**验收**：能说出 `DESC users` 里 `id` 那行 `PRIMARY KEY` 和 `AUTO_INCREMENT` 各自什么意思（主键=每行唯一标识；自增=不用手动填 id）。

---

## 阶段 2：增删改（DML）— 第 1 天

**学什么**：`INSERT` 加行、`UPDATE` 改行、`DELETE` 删行。

**练习**：
```sql
-- 增：新增一个用户
INSERT INTO users (name, age, city) VALUES ('阿紫', 26, '杭州');

-- 改：把阿青年龄改成 23
UPDATE users SET age = 23 WHERE name = '阿青';

-- 删：删掉刚才的测试用户（先插一个假的再删）
DELETE FROM users WHERE name = '阿紫';

-- 查一下确认
SELECT * FROM users;
```

**⚠️ 必踩的坑**：
```sql
UPDATE users SET age = 99;   -- 没有 WHERE = 全表改！危险！
DELETE FROM users;           -- 没有 WHERE = 全表删！危险！
```
在自己练习库里可以踩一次感受后果，但**记住：UPDATE/DELETE 必须先写 WHERE 再执行**。

**验收**：能背出"增删改三兄弟"语法，并说出"不带 WHERE 会怎样"。

---

## 阶段 3：查询基础（DQL）— 第 2 天

**学什么**：`SELECT` 是天天用的，练熟过滤和排序。

**逐个练**（每个都执行并看结果）：
```sql
-- 1. 查某些列
SELECT name, city FROM users;

-- 2. 过滤：等于 / 不等于 / 大于小于
SELECT * FROM users WHERE city = '上海';
SELECT * FROM users WHERE age >= 30;
SELECT * FROM users WHERE city != '上海';

-- 3. 多条件：AND / OR
SELECT * FROM users WHERE city = '上海' AND age > 25;
SELECT * FROM users WHERE city = '上海' OR city = '北京';

-- 4. 模糊 / 范围
SELECT * FROM users WHERE name LIKE '小%';        -- 以"小"开头
SELECT * FROM users WHERE age BETWEEN 20 AND 30;  -- 20~30 含边界
SELECT * FROM users WHERE city IN ('上海', '深圳');

-- 5. 排序 + 限量
SELECT * FROM users ORDER BY age DESC;       -- 从大到小
SELECT * FROM users ORDER BY age ASC LIMIT 2; -- 最小的两个
```

**验收**：不看笔记，能独立写出"查年龄大于 25 且不是北京的用户，按年龄倒序"这句 SQL。

---

## 阶段 4：聚合与分组（GROUP BY）— 第 3 天

**学什么**：`COUNT` 数行数、`SUM` 求和、`AVG` 平均、`MAX/MIN` 最大最小、`GROUP BY` 分组统计。

**练习**：
```sql
-- 总数 / 平均年龄
SELECT COUNT(*) FROM users;
SELECT AVG(age) FROM users;

-- 每个城市的用户数（分组统计）
SELECT city, COUNT(*) FROM users GROUP BY city;

-- 每个用户的总订单金额
SELECT user_id, SUM(amount) FROM orders GROUP BY user_id;

-- HAVING：分组后再过滤（不能写 WHERE）
SELECT user_id, SUM(amount) AS total
FROM orders
GROUP BY user_id
HAVING total > 100;
```

**⚠️ 区分**：`WHERE` 过滤"分组前"的行，`HAVING` 过滤"分组后"的结果。

**验收**：能算出"每个城市的用户数"，并说出 HAVING 和 WHERE 的区别。

---

## 阶段 5：多表联结（JOIN）— 第 4 天

**学什么**：`INNER JOIN` 只留两边都匹配的，`LEFT JOIN` 左表全保留。**你前面问的 LEFT/RIGHT JOIN 在这里实战**。

**练习**：
```sql
-- INNER JOIN：有订单的用户及其订单
SELECT u.name, o.amount, o.status
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN：所有用户，没下过单的也能看到（订单列为 NULL）
SELECT u.name, o.amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

-- 经典统计：每个用户有几单（LEFT JOIN + 分组）
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;
```

**对照观察**：`小美`(id=4) 没下过单 → INNER 里看不到她，LEFT 里能看到她且 `order_count=0`。这就是 LEFT JOIN 的价值。

**验收**：能独立写出"每个用户的下单数（含没下单的）"，并解释为什么用 LEFT JOIN 而不是 INNER。

---

## 阶段 6：约束与索引 — 第 5 天

**学什么**：`PRIMARY KEY`、`NOT NULL`、`UNIQUE`、`DEFAULT`、`FOREIGN KEY`；索引为什么快。

**练习**：
```sql
-- 建一张带约束的新表
CREATE TABLE products (
    id    INT PRIMARY KEY,
    name  VARCHAR(50) NOT NULL,        -- 不能为空
    code  VARCHAR(20) UNIQUE,          -- 不能重复
    price DECIMAL(10,2) DEFAULT 0.00   -- 默认值
);

-- 试踩约束
INSERT INTO products (id, name) VALUES (1, '耳机');          -- 成功，price=0
INSERT INTO products (id) VALUES (2);                        -- 报错：name 不能为空
INSERT INTO products (id, name, code) VALUES (2,'鼠标','A1');-- 成功
INSERT INTO products (id, name, code) VALUES (3,'键盘','A1');-- 报错：code 重复
```

**索引实验**（感受为什么建索引）：
```sql
-- 看一条查询的执行计划
EXPLAIN SELECT * FROM orders WHERE user_id = 3;
-- 给 user_id 加索引后再看
ALTER TABLE orders ADD INDEX idx_user (user_id);
EXPLAIN SELECT * FROM orders WHERE user_id = 3;
```
对比两次 `EXPLAIN` 输出里的 `type` 列（`ALL`=全表扫，`ref`=走索引）。

**验收**：能说出主键/非空/唯一/默认四种约束各防什么；能用 `EXPLAIN` 看出有没有走索引。

---

## 阶段 7：事务 — 第 6 天

**学什么**：`START TRANSACTION` / `COMMIT` / `ROLLBACK`（对应 PPT 模块 2）。

**练习**（转账场景，先建账本表）：
```sql
CREATE TABLE account (id INT PRIMARY KEY, balance INT);
INSERT INTO account VALUES (1, 1000), (2, 1000);

START TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE id = 1;
UPDATE account SET balance = balance + 100 WHERE id = 2;
COMMIT;   -- 查一下两边都变了

-- 再试回滚：
START TRANSACTION;
UPDATE account SET balance = balance - 500 WHERE id = 1;
SELECT * FROM account;      -- 看到 id=1 变 400（但还没提交）
ROLLBACK;                   -- 撤销！
SELECT * FROM account;      -- 又回到 1000
```

**验收**：能演示"COMMIT 后改动保留、ROLLBACK 后改动撤销"，并说出事务解决什么问题（一组操作不能成功一半）。

---

## 阶段 8（可选进阶）— 第 7 天

**子查询**：`SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE city='上海');`

**窗口函数**（按订单金额排名）：`SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rn FROM orders;`

**视图**：`CREATE VIEW v_user_orders AS SELECT u.name, COUNT(o.id) c FROM users u LEFT JOIN orders o ON u.id=o.user_id GROUP BY u.id;`

练完进阶，回 PHASE2-PLAN.md 模块 1：设计你的 `chat_message` 表（session_id/role/content/status/created_at + session_id 索引），你会发现自己已经全会了。

---

## 节奏 & 自查

| 天 | 阶段 | 自测题（答不上就重练） |
|---|---|---|
| 1 | 建表 / 增删改 | 建一张表要写哪些关键字？UPDATE 忘写 WHERE 会怎样？ |
| 2 | 查询基础 | 写"上海、年龄>25、按年龄倒序" |
| 3 | 聚合分组 | HAVING 和 WHERE 区别？ |
| 4 | 联结 | 每个用户订单数（含 0 单）为什么用 LEFT JOIN？ |
| 5 | 约束索引 | EXPLAIN 里 type=ALL 和 ref 差在哪？ |
| 6 | 事务 | COMMIT/ROLLBACK 分别何时用？ |
| 7 | 进阶 | 子查询 / 窗口函数能读懂即可 |

**每天 30–60 分钟**，重点是**自己敲**，不是看。卡住就把报错贴给我，或者把练习库里建出来的数据发我检查。
