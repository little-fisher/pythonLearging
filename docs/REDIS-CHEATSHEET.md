# Redis 命令速查手册

> 配合 `docs/REDIS-PRACTICE-PLAN.md` 使用。所有命令在 `redis-cli` 里敲。
> 核心认知：**Redis = 内存 KV + 每 key 可设过期**，不是永久存储。
> 进入方式：`docker exec -it redis7 redis-cli` ；清空全部：`FLUSHALL`

---

## 一、基础 KV（String）

```bash
SET key value           # 存
SET key value EX 60     # 存 + 60 秒过期（一条命令搞定）
GET key                 # 取（不存在返回 (nil)）
DEL key                 # 删（返回删了几条）
EXISTS key              # 在不在（1=在 / 0=不在）
KEYS *                  # 看所有 key（仅调试用，生产别用）
```

---

## 二、数据类型

### Hash —— 一条记录的多个字段（像 MySQL 一行）
```bash
HSET user:1 name "小林" age 24 city "上海"   # 存多个字段 → 3
HGET user:1 name          # 取单个字段
HGETALL user:1            # 取全部字段
```

### List —— 有序列表（消息流 / 最近 N 条）
```bash
LPUSH list value    # 从头部塞 → 新的在前
RPUSH list value    # 从尾部塞 → 保持原顺序
LRANGE list 0 -1    # 看全部
LTRIM  list 0 9     # 只留前 10 个，多余自动丢
```
> ⚠️ 顺序：`LPUSH` 新的在前；回填有序历史用 `RPUSH` 保持顺序（见练习计划阶段 5）。

### Set —— 去重集合
```bash
SADD set member     # 加成员（重复加返回 0，加不进）
SMEMBERS set        # 看所有成员
```

### ZSet —— 带分数的排名集合（选学）
```bash
ZADD zset score member    # 加（分数+成员）
ZRANGE zset 0 -1          # 按分数从小到大
```

---

## 三、过期时间 TTL

```bash
TTL key              # 剩余秒数；-1=永久；-2=key 不存在
EXPIRE key 30        # 给已有 key 设过期（覆盖）
PERSIST key          # 取消过期（变永久）
SET key value EX 60  # 存的同时设过期
```

**TTL 只有"同一个 key、中间真实等了时间、没重新 SET"才会减少**（脚本里 set 完立刻查永远是最初值）。

---

## 四、Key 设计约定（冒号分层）

```
业务前缀:对象:具体id
chat:session:1001          user:1001:profile
verify:code:13800138000    product:7:detail
order:888:status           recent:questions
```

**判断放 Redis 还是 MySQL**：问"这条数据过期了会出大事吗？"
- 会 → MySQL（聊天记录、订单、用户资料）
- 不会 → Redis（验证码、登录态、热点缓存、最近 N 条）

---

## 五、Python（redis-py）对照

连接（`decode_responses=True` 让返回是字符串不是 bytes）：
```python
import redis
r = redis.Redis(host="127.0.0.1", port=6379, db=0, decode_responses=True)
```

| redis-cli | redis-py |
|---|---|
| `SET k v EX 60` | `r.set("k", "v", ex=60)` |
| `GET k` | `r.get("k")` |
| `DEL k` | `r.delete("k")` |
| `TTL k` | `r.ttl("k")` |
| `LPUSH k v` | `r.lpush("k", "v")` |
| `RPUSH k v1 v2` | `r.rpush("k", "v1", "v2")` |
| `LRANGE k 0 -1` | `r.lrange("k", 0, -1)` |
| `LTRIM k 0 9` | `r.ltrim("k", 0, 9)` |
| `EXPIRE k 60` | `r.expire("k", 60)` |
| `HGETALL k` | `r.hgetall("k")` |

---

## 六、缓存旁路模式（Cache-Aside，最常用）

```python
def get_recent(session_id):
    key = f"chat:session:{session_id}"
    cached = r.lrange(key, 0, -1)     # ① 先查 Redis
    if cached:
        return cached                  # 命中 → 直接用，不碰库
    rows = query_mysql(session_id)     # ② 未命中 → 查 MySQL
    r.delete(key)                      # ③ 回填缓存
    r.rpush(key, *rows)                #    保持原顺序
    r.expire(key, 1800)                #    并设过期
    return rows
```

**缓存会话最近 N 条消息**：
```python
def cache_message(session_id, msg):
    key = f"chat:session:{session_id}"
    r.lpush(key, msg)      # 新消息塞头部
    r.ltrim(key, 0, 9)     # 只留最近 10 条
    r.expire(key, 1800)    # 30 分钟没人动就清
```

---

## 常见坑速记

| 坑 | 后果/说明 |
|---|---|
| 以为 Redis 是永久存储 | 重启/过期会丢，聊天记录别只放 Redis |
| `LPUSH` 回填有序数据 | 顺序被反转；回填历史用 `RPUSH` |
| 脚本里 set 完立刻查 TTL | 永远是初始值，要 `time.sleep` 等待才见倒计时 |
| 忘了 `decode_responses=True` | 拿到的是 `b'...'` bytes，不是字符串 |
| `KEYS *` 放生产 | 会卡住 Redis，调试才用 |
| 中文显示乱码 | 连接时加 `decode_responses=True` |
