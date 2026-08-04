# Redis 从零练习计划（配合你的 Docker 容器）

> 前置：`redis7` 容器已启动（`docker start redis7`）
> 目标：5 天把 Redis 的 KV、过期、数据类型、Key 设计、Python 接入过一遍，练完能在你的 FastAPI 里做"缓存旁路"。
> 这份计划是 `PHASE2-PLAN.md` 模块 4 的前置课。**始终记住：Redis 是内存+过期，不是永久存储。**

---

## 0. 怎么练

```bash
# 进入 Redis 命令行（相当于 mysql 客户端）
docker exec -it redis7 redis-cli

# 退出：exit ；重置全部数据：FLUSHALL
```

两条最重要的直觉：
- Redis = **超大内存字典**（key → value），读写快到毫秒
- 每个 key 可以**单独设过期时间**（到期自动消失）——这是它和 MySQL 最大的不同

---

## 阶段 1：第一个 KV（String 类型）— 第 1 天

**学什么**：`SET` 存、`GET` 取、`DEL` 删、`EXISTS` 判断、`KEYS` 看所有 key。

**逐个敲**（每个都猜一下再回车）：
```bash
SET name "小林"          # 存一个键值 → OK
GET name                # 取 → "小林"
EXISTS name             # 这个 key 存在吗 → 1（存在）/ 0（不存在）
DEL name                # 删除 → 1
GET name                # 再取 → (nil) 表示没有
SET age 24              # 注意：值也可以存数字（实际是字符串）
```

**理解**：`SET key value` / `GET key` 是 Redis 最基础的两个命令，其它所有类型都是在这个"键值"上扩展的。

**验收**：能不看笔记写出"存一个值、取出来、删掉、确认没了"这四条命令。

---

## 阶段 2：五种常用类型 — 第 2 天

Redis 一个 key 能存好几种"形状"，挑 4 个最常用的：

### ① Hash（哈希）—— 存"一个人的多个字段"
```bash
HSET user:1 name "小林" age 24 city "上海"   # 存 3 个字段 → 3
HGET user:1 name            # 取单个字段 → "小林"
HGETALL user:1              # 取全部 → name 小林 age 24 city 上海
```
直觉：Hash = **一条记录的多个字段**（很像 MySQL 的一行）。

### ② List（列表）—— 存"最近 N 条"
```bash
LPUSH recent "第1条"        # 从头部塞入
LPUSH recent "第2条" "第3条"
LRANGE recent 0 -1          # 看全部 → 第3条 第2条 第1条（新的在前）
LTRIM recent 0 4            # 只留前 5 个（多的自动丢）
```
直觉：List = **有序队列**，`LPUSH` 塞、`LRANGE 0 -1` 看，`LTRIM 0 4` 限长度。

### ③ Set（集合）—— 存"去重的一组值"
```bash
SADD tags "python" "sql"    # 加成员
SADD tags "python"          # 重复加 → 0（加不进去）
SMEMBERS tags               # 看所有成员
```
直觉：Set = **去重的集合**，成员不能重复。

### ④ ZSet（有序集合）—— 带分数的排名
```bash
ZADD leaderboard 100 "a" 90 "b" 80 "c"   # 分数+成员
ZRANGE leaderboard 0 -1                  # 按分数从小到大 → c b a
```
直觉：ZSet = **带分数的集合**，可排名（选学，了解即可）。

**验收**：能说出"存一个人多个字段用 Hash、存最近消息列表用 List、去重用 Set"。

---

## 阶段 3：过期时间 TTL — 第 3 天

**学什么**：Redis 的"灵魂"——每个 key 可以设存活时间，到期自动消失。

```bash
SET token "abc123" EX 60    # 存的同时设 60 秒后过期
TTL token                   # 看还剩多少秒 → 60、59、58...
EXPIRE token 30             # 给已有 key 重新设过期（覆盖为 30 秒）
TTL token                   # → 30
PERSIST token               # 取消过期（变成永久）
```

**演示"到期消失"**：
```bash
SET temp "bye" EX 5
TTL temp                    # → 4、3、2...
# 等 5 秒后
GET temp                    # → (nil) 自己没了！
```

**为什么重要**：Redis 里的数据"该消失就消失"——验证码、临时会话、热点缓存都靠这个。**过期时间 = 你给内存做的"自动垃圾回收"**。

**验收**：能说出 TTL 的作用，以及"为什么聊天记录不能只放 Redis"（会过期消失，得放 MySQL）。

---

## 阶段 4：Key 设计 — 第 4 天

**学什么**：Redis 的 key 不是乱起的，约定用**冒号分层**，一眼看懂"这是谁的什么东西"。

| key 写法 | 含义 |
|---|---|
| `chat:session:1001` | 会话 1001 的聊天相关 |
| `user:1001:profile` | 用户 1001 的资料 |
| `verify:code:13800138000` | 手机号对应的验证码 |
| `recent:questions` | 最近的提问列表 |

**练习**：给下面这些场景起 key（自己先起，再看答案）
1. 用户 42 的购物车 → `user:42:cart` ✅
2. 商品 7 的详情缓存 → `product:7:detail` ✅
3. 订单 888 的状态 → `order:888:status` ✅

**顺带想清楚"什么进 Redis、什么进 MySQL"**：
- **进 Redis**：短期会话、验证码、热点结果、最近 N 条（可以接受丢失、要快）
- **进 MySQL**：聊天记录、订单、用户信息（必须持久、要查、有关系）

**验收**：能说出冒号命名的规则，并正确判断"一条聊天记录"该放 Redis 还是 MySQL。

---

## 阶段 5：在 Python 里用（redis-py）— 第 4 天

依赖先装好（`backend/.venv` 里）：`pip install redis`

**最小连接 + 读写**（在 `backend/` 下建临时脚本 `tmp_redis.py` 跑）：
```python
import redis

r = redis.Redis(host="127.0.0.1", port=6379, db=0, decode_responses=True)

r.set("name", "小林", ex=60)   # 存 + 60 秒过期
print(r.get("name"))           # 小林
print(r.ttl("name"))           # 剩余秒数
```

**缓存旁路模式**（重点，PHASE2 模块 4 要用）：**先查 Redis，没有再查 MySQL**：
```python
def get_recent(session_id: str):
    key = f"chat:session:{session_id}"
    cached = r.lrange(key, 0, -1)          # 1. 先看缓存
    if cached:
        return cached                       # 命中 → 直接返回
    rows = query_mysql(session_id)          # 2. miss → 查 MySQL（你已有的代码）
    r.delete(key)                           # 3. 回填缓存
    r.rpush(key, *rows)
    r.expire(key, 1800)                     #    并设过期
    return rows
```

**验收**：能跑通"先查 Redis → miss → 查 MySQL → 回填并设过期"这段逻辑。

---

## 阶段 6：综合 — 缓存会话最近几轮消息 — 第 5 天

**目标**：把你项目里某个会话的最近几轮消息缓存进 Redis。

```python
import redis
r = redis.Redis(host="127.0.0.1", port=6379, db=0, decode_responses=True)

def cache_message(session_id: str, msg: str):
    key = f"chat:session:{session_id}"
    r.lpush(key, msg)          # 塞到列表头
    r.ltrim(key, 0, 9)         # 只留最近 10 条
    r.expire(key, 1800)        # 30 分钟没人动就清掉
```

**验收（最终）**：
- `LPUSH` 塞几条 → `LRANGE 0 -1` 能看到，且顺序是"新的在前"
- 超过 10 条后，最旧的自动被 `LTRIM` 挤掉
- 设了 `EXPIRE` 后 `TTL` 能看到倒计时

练完回到 `PHASE2-PLAN.md` 模块 4，你会发现自己已经全会了。

---

## 节奏 & 自查

| 天 | 阶段 | 自测题 |
|---|---|---|
| 1 | KV 基础 | SET/GET/DEL 怎么写？EXISTS 返回 1/0 各啥意思？ |
| 2 | 数据类型 | 一人多字段用啥？最近消息列表用啥？ |
| 3 | 过期 | TTL 干啥的？为什么聊天记录不能只放 Redis？ |
| 4 | Key 设计 + Python | 冒号命名规则？缓存旁路的四步？ |
| 5 | 综合 | 最近 10 条消息缓存怎么实现？ |

**每天 30–60 分钟，自己敲**。卡住把报错/命令贴给我。练坏了数据随时 `FLUSHALL` 重置。
