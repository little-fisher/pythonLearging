# SQL 命令速查手册（MySQL）

> 配合 `docs/SQL-PRACTICE-PLAN.md` 使用。每条都是"骨架"，把 `<>` 换成你自己的表名/列名/值。
> 关键字大写是惯例，MySQL 不区分大小写；表名列名按建表时的写法来。

---

## 一、DDL —— 管结构（库 / 表）

```sql
-- 建库
CREATE DATABASE 库名 CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS 库名;      -- 已存在就不报错

-- 进库 / 看库
USE 库名;
SHOW DATABASES;                          -- 列出所有库
SHOW TABLES;                             -- 列出当前库所有表
DESC 表名;                               -- 查看表结构（DESCRIBE 的缩写）

-- 建表
CREATE TABLE 表名 (
    id   INT PRIMARY KEY AUTO_INCREMENT, -- 主键 + 自增
    列名 数据类型 [NOT NULL] [DEFAULT 默认值],
    列名 数据类型 ...
);

-- 改结构
ALTER TABLE 表名 ADD COLUMN 列名 数据类型;    -- 加列
ALTER TABLE 表名 ADD INDEX 索引名 (列名);      -- 加索引
ALTER TABLE 表名 DROP COLUMN 列名;            -- 删列

-- 删
DROP TABLE 表名;
DROP DATABASE 库名;
```

常用数据类型：`INT` 整数 / `VARCHAR(n)` 变长字符串 / `TEXT` 长文本 / `DECIMAL(10,2)` 金额 / `DATETIME` 时间。

---

## 二、DML —— 管数据（增删改）

```sql
-- 增：加一行
INSERT INTO 表名 (列1, 列2, 列3) VALUES (值1, 值2, 值3);
INSERT INTO 表名 (列1, 列2) VALUES (值1, 值2), (值a, 值b);   -- 一次加多行

-- 改：改某些行
UPDATE 表名 SET 列 = 新值 WHERE 条件;
UPDATE 表名 SET 列1 = 值1, 列2 = 值2 WHERE 条件;             -- 一次改多列

-- 删：删某些行
DELETE FROM 表名 WHERE 条件;

-- ⚠️ 铁律：UPDATE / DELETE 不带 WHERE = 全表改/全表删！先写 WHERE 再执行！
```

---

## 三、DQL —— 管查询（SELECT，天天用）

```sql
-- 基本骨架
SELECT 列1, 列2 FROM 表名;
SELECT * FROM 表名;                       -- 查所有列

-- 过滤 WHERE
SELECT * FROM 表名 WHERE 列 = 值;
SELECT * FROM 表名 WHERE 列 != 值;         -- 不等于（也可写 <> ）
SELECT * FROM 表名 WHERE 列 > 值;           -- > < >= <= 同理
SELECT * FROM 表名 WHERE 列1 = 值1 AND 列2 = 值2;   -- 同时满足
SELECT * FROM 表名 WHERE 列1 = 值1 OR 列2 = 值2;    -- 满足其一
SELECT * FROM 表名 WHERE 列 LIKE '小%';     -- 模糊：% 任意多字符，_ 单个字符
SELECT * FROM 表名 WHERE 列 BETWEEN 20 AND 30;      -- 范围（含边界）
SELECT * FROM 表名 WHERE 列 IN ('a', 'b');           -- 在集合里
SELECT * FROM 表名 WHERE 列 IS NULL;                 -- 空值判断（不能用 = NULL）

-- 排序 + 限量
SELECT * FROM 表名 ORDER BY 列 ASC;        -- 升序（默认）
SELECT * FROM 表名 ORDER BY 列 DESC;       -- 降序
SELECT * FROM 表名 ORDER BY 列1 DESC, 列2 ASC;  -- 多列排序
SELECT * FROM 表名 LIMIT 10;               -- 只取前 10 行
SELECT * FROM 表名 LIMIT 5 OFFSET 10;      -- 跳过 10 行取 5 行（分页）

-- 去重
SELECT DISTINCT 列 FROM 表名;
```

---

## 四、聚合与分组（统计）

```sql
-- 聚合函数
SELECT COUNT(*) FROM 表名;            -- 行数
SELECT SUM(列) FROM 表名;             -- 求和
SELECT AVG(列) FROM 表名;             -- 平均
SELECT MAX(列), MIN(列) FROM 表名;    -- 最大 / 最小

-- 分组统计
SELECT 组列, COUNT(*) FROM 表名 GROUP BY 组列;

-- 分组后再过滤（HAVING），别名可用
SELECT 组列, SUM(列) AS total
FROM 表名
GROUP BY 组列
HAVING total > 100;

-- ⚠️ WHERE 过滤分组前的行，HAVING 过滤分组后的结果，不能混用
```

---

## 五、多表联结（JOIN）

```sql
-- INNER JOIN：只留两边都匹配的行
SELECT a.列, b.列
FROM 表a a
INNER JOIN 表b b ON a.id = b.a_id;

-- LEFT JOIN：左表全保留，右表没匹配上补 NULL
SELECT a.列, b.列
FROM 表a a
LEFT JOIN 表b b ON a.id = b.a_id;

-- 经典：每个用户的订单数（含没下单的 0 单）
SELECT a.name, COUNT(b.id) AS cnt
FROM 表a a
LEFT JOIN 表b b ON a.id = b.user_id
GROUP BY a.id;
```

记忆：`INNER` 两边都要有；`LEFT` 左边为主、右边可缺。

---

## 六、约束与索引

```sql
CREATE TABLE 表名 (
    id   INT PRIMARY KEY,            -- 主键：每行唯一标识
    列   VARCHAR(50) NOT NULL,       -- 非空
    列   VARCHAR(20) UNIQUE,         -- 唯一：不能重复
    列   DECIMAL(10,2) DEFAULT 0.00, -- 默认值
    外键列 INT,
    FOREIGN KEY (外键列) REFERENCES 另一张表(id)   -- 外键：引用另一张表
);

-- 看执行计划（判断有没有走索引）
EXPLAIN SELECT * FROM 表名 WHERE 列 = 值;
-- type = ALL → 全表扫（慢）；type = ref / range → 走索引（快）
```

---

## 七、事务（一致性）

```sql
START TRANSACTION;                  -- 开启事务
UPDATE ...;                          -- 一组操作
UPDATE ...;
COMMIT;                              -- 全部成功 → 提交，改动生效
ROLLBACK;                            -- 任一步出错 → 回滚，回到开始前状态
```

---

## 八、进阶（可选）

```sql
-- 子查询
SELECT * FROM 表b WHERE user_id IN (SELECT id FROM 表a WHERE 条件);

-- 窗口函数（分组内排名）
SELECT *, ROW_NUMBER() OVER (PARTITION BY 组列 ORDER BY 列 DESC) AS rn FROM 表名;

-- 视图（把一段查询存成"虚拟表"）
CREATE VIEW v_名字 AS SELECT ... ;
```

---

## 常见坑速记

| 坑 | 后果 |
|---|---|
| UPDATE / DELETE 忘写 WHERE | 全表改 / 全表删 🔥 |
| `列 = NULL` | 永远不匹配，要用 `IS NULL` |
| WHERE 里用聚合函数（COUNT 等） | 报错，要放 HAVING |
| 分页想跳行 | `LIMIT n OFFSET m`，别只靠 LIMIT |
| 中文乱码 | 建库/建表用 `CHARACTER SET utf8mb4` |
