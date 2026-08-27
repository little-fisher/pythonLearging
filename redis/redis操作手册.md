# Redis 操作手册

> 配套 `REDIS-LEARNING-PLAN.md` 使用，按学习进度累积更新。
> 当前覆盖：Day 1（环境与基础 Key 操作）、Day 2（String / Hash）、Day 3（List / Set / ZSet）。
> 示例默认在 `redis-cli -p 6380`（Docker 容器 redis-day3，Redis 7.4.9）中执行。

---

## 〇、环境

```bash
docker run -d --name redis-day3 -p 6380:6379 redis:7   # 启动容器
redis-cli -p 6380                                       # 连接
redis-cli -p 6380 ping                                  # 连通性测试 → PONG
redis-cli -p 6380 HELP @string                          # 按类型查命令（cli 内置帮助）
```

---

## 一、通用 Key 操作（Day 1）

| 命令 | 作用 |
|------|------|
| `SET key value` / `GET key` / `DEL key` | 基础增查删 |
| `EXISTS key` | 是否存在，返回 1/0 |
| `EXPIRE key seconds` | 设置过期时间（秒） |
| `TTL key` | 查剩余秒数；`-1` = 永不过期，`-2` = 不存在 |
| `TYPE key` | 查 key 的类型 |
| `KEYS pattern` | 按模式找 key，**生产禁用**（全库扫描阻塞），用 `SCAN` 替代 |
| `SCAN cursor` | 分批游标遍历 key |
| `DBSIZE` | 当前库 key 数量 |
| `FLUSHDB` | 清空当前库（危险） |

**Key 命名规范**：`业务:模块:id`，如 `recent:session1`、`hot:weibo`。TTL 建议不超 30 天。

---

## 二、String（Day 2）

| 命令 | 作用 |
|------|------|
| `SET key value [EX seconds]` | 写入，可顺带设过期 |
| `SETEX key seconds value` | 写入 + 过期时间，一条命令 |
| `SETNX key value` | 仅当 key 不存在才写入 → 分布式锁的基础 |
| `GET key` | 读取 |
| `MSET k1 v1 k2 v2` / `MGET k1 k2` | 批量写/读，省网络往返 |
| `INCR key` / `DECR key` | 原子 ±1；key 不存在时从 0 开始 |
| `INCRBY key n` | 原子加 n |

**要点**

- `INCR` 天然线程安全：单线程执行命令，无需加锁
- 计数器按日重置：key 带日期（`pv:2026-08-27`）+ TTL；总量统计用独立 key
- 单值超 10KB 建议拆分或改 Hash

---

## 三、Hash（Day 2）

| 命令 | 作用 |
|------|------|
| `HSET key field value` | 写字段 |
| `HGET key field` | 读单字段 |
| `HGETALL key` | 读全部字段 |
| `HINCRBY key field n` | 字段级原子加 |
| `HDEL key field` | 删字段 |
| `HSCAN key cursor` | 分批遍历（大 Hash 替代 HGETALL） |

**要点**

- 选 Hash 而不是 String + JSON 的场景：**需要字段级原子更新**时（改一个字段不用整体读出-改-写回）
- 字段超 1000 建议拆分或改 JSON

---

## 四、List（Day 3，有序、可重复）

| 命令 | 作用 | 时间复杂度 |
|------|------|-----------|
| `LPUSH key a b c` | 从左侧（头部）依次插入，最终顺序 `c b a` | O(1)/元素 |
| `RPUSH key a b c` | 从右侧（尾部）依次插入，最终顺序 `a b c` | O(1)/元素 |
| `LPOP key` / `RPOP key` | 从左/右弹出并**删除**（不是查看） | O(1) |
| `BLPOP key [key ...] timeout` | 阻塞式左弹出，超时秒数；支持监听多个 key | O(1) |
| `BRPOP key [key ...] timeout` | 阻塞式右弹出 | O(1) |
| `LRANGE key start stop` | 按从左到右返回区间；`-1` = 最右；越界返回空不报错 | O(N) |
| `LINDEX key index` | 取指定位置元素，`-1` = 最右 | O(N) |
| `LLEN key` | 长度；不存在的 key 返回 0 | O(1) |
| `LTRIM key start stop` | 裁剪保留区间，其余删除 | O(N) |

**要点**

- 方向记忆：LPUSH 最新在最前（索引 0），RPUSH 最新在最后
- 组合模式：
  - 栈（LIFO）：`LPUSH` + `LPOP`（同端进出）
  - 队列（FIFO）：`LPUSH` + `RPOP`（异端进出）
  - 最新 N 条：`LPUSH` + `LTRIM key 0 99`（必须裁剪防内存膨胀）
  - 阻塞队列：`BLPOP`（消息到达即唤醒，零空转；优于轮询）
- `BLPOP` 返回两个值：key 名 + 元素（因为可监听多 key）
- 局限：无 ACK 确认、无多消费者组，只适合做可容忍丢消息的轻量队列

---

## 五、Set（Day 3，无序、不重复）

| 命令 | 作用 | 时间复杂度 |
|------|------|-----------|
| `SADD key m1 m2 ...` | 添加，自动去重；返回**实际新增数** | O(1)/元素 |
| `SMEMBERS key` | 返回全部成员（顺序不保证，勿依赖） | O(N) |
| `SCARD key` | 成员个数 | O(1) |
| `SISMEMBER key member` | 是否存在，返回 1/0 | O(1) |
| `SREM key m1 m2 ...` | 删除，返回实际删除数 | O(1)/元素 |
| `SINTER k1 k2 ...` | 交集（共同关注） | O(N·M) |
| `SUNION k1 k2 ...` | 并集（去重合并） | O(N) |
| `SDIFF k1 k2 ...` | 差集，**有方向**：第一个 key 有而后面没有的 | O(N) |
| `SINTERSTORE dest k1 k2` | 交集结果存入 dest（可复用） | O(N·M) |
| `SUNIONSTORE dest k1 k2` | 并集结果存入 dest | O(N) |
| `SSCAN key cursor` | 分批游标遍历（大集合替代 SMEMBERS） | 增量 |

**要点**

- `SISMEMBER` 是 O(1)（底层哈希表），List 查元素要 O(N) 遍历——这是选 Set 的核心理由
- 集合运算 O(N) 以上，大集合会阻塞主线程；生产环境共同关注类功能通常离线算好存起来
- 典型场景：标签系统、共同关注、抽奖去重

---

## 六、ZSet（Day 3，成员唯一 + score 排序）

| 命令 | 作用 | 备注 |
|------|------|------|
| `ZADD key score member [score member ...]` | 添加/更新，**分数在前成员在后** | O(logN) |
| `ZINCRBY key incr member` | 原子加分；成员不存在则以 0 为初始值自动创建 | O(logN) |
| `ZRANGE key start stop [WITHSCORES]` | 按分数**升序**列成员 | |
| `ZREVRANGE key start stop [WITHSCORES]` | 按分数**降序**列成员 → 排行榜用它 | |
| `ZRANK key member` | 升序名次，**从 0 开始** | O(logN) |
| `ZREVRANK key member` | 降序名次，展示时记得 **+1** | O(logN) |
| `ZSCORE key member` | 查成员分数 | O(1) |
| `ZCARD key` | 成员个数 | O(1) |
| `ZRANGEBYSCORE key min max` | 按分数范围查，**升序**返回 | |
| `ZREVRANGEBYSCORE key max min` | 降序版，注意参数是 **max 在前** | 与 ZRANGEBYSCORE 相反！ |
| `ZCOUNT key min max` | 统计分数区间内成员数 | |
| `ZREMRANGEBYSCORE key min max` | 按分数范围删除（清过气词条/过期记录） | |

**区间语法**

- 默认闭区间：`70 160` 含两端
- 加 `(` 为开区间：`(60` = 大于 60 不含 60
- 无穷：`-inf` / `+inf`

**要点**

- 底层：跳表（排序/范围查询 O(logN)）+ 哈希表（成员→score O(1) 查找）
- 排序自动维护：`ZINCRBY` 后无需重排，下次查询已是新名次
- 适用判断：**"元素 + 一个可比较数值 + 需按数值排序或圈范围"** → 想 ZSet
- 排行榜之外的场景：
  - 延迟队列：score = 执行时间戳，`ZRANGEBYSCORE key 0 <now>` 取到期任务
  - 滑动窗口限流：score = 请求时间戳，`ZREMRANGEBYSCORE` 清窗口外记录 + `ZCARD` 计数
  - 优先级队列：score = 优先级
  - GEO 地理位置类型底层就是 ZSet（geohash 当 score）

---

## 七、redis-py 映射速查

真实项目用客户端库，命令名变方法名、参数原样传：

```python
import redis
r = redis.Redis(host="127.0.0.1", port=6380, db=0, decode_responses=True)
# decode_responses=True：返回 str 而非 bytes；内部自带连接池
```

| redis-cli | redis-py |
|---|---|
| `SET k v` / `GET k` | `r.set("k", "v")` / `r.get("k")` |
| `INCR k` | `r.incr("k")` |
| `EXPIRE k 60` | `r.expire("k", 60)` |
| `HSET k f v` | `r.hset("k", "f", "v")` |
| `HGETALL k` | `r.hgetall("k")` → dict |
| `LPUSH key a` | `r.lpush("key", "a")` |
| `LTRIM key 0 9` | `r.ltrim("key", 0, 9)` |
| `SINTER k1 k2` | `r.sinter("k1", "k2")` |
| `ZADD key 100 "m"` | `r.zadd("key", {"m": 100})` ← 注意是 dict，成员在前 |
| `ZINCRBY key 50 "m"` | `r.zincrby("key", 50, "m")` ← 增量在前成员在后 |
| `ZREVRANGE key 0 2 WITHSCORES` | `r.zrevrange("key", 0, 2, withscores=True)` |
| `ZREVRANK key "m"` | `r.zrevrank("key", "m")` |

---

## 八、易错点清单

1. `LPUSH key a b c` 多参数顺序会反转 → 列表里是 `c b a`
2. 没有 `RRANGE`：`LRANGE key -3 -1` 即可看尾部
3. `POP` 是取出并删除；只想看用 `LINDEX`
4. `SDIFF` 有方向性，key 顺序换结果就变
5. `ZADD` 分数在前成员在后（redis-py 里反过来，dict 成员在前）
6. `ZREVRANGEBYSCORE` 参数 max 在前 min 在后
7. `ZRANK`/`ZREVRANK` 从 0 开始，展示名次 +1
8. 区间 `(60` 表示开区间，`-inf`/`+inf` 表示无穷
9. `KEYS`/`SMEMBERS`/`HGETALL` 在大 key 上阻塞主线程，生产用 `SCAN`/`SSCAN`/`HSCAN`
