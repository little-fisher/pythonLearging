# Redis 学习计划

> 依据《Redis 核心技术培训.pptx》整理。PPT 共四章 + 课后作业，本计划按此结构拆分为 5 个阶段，建议 **7 天**完成（每天约 1.5~2 小时），时间紧张可压缩到 4 天。

---

## 总体路线

```
Day 1   概述与核心价值 + 环境搭建
Day 2   数据结构（String / Hash）
Day 3   数据结构（List / Set / ZSet）
Day 4   持久化（RDB / AOF / 混合持久化）
Day 5   高级特性（Pub/Sub、Lua）+ 集群部署（主从/哨兵/Cluster）
Day 6   生产实践（运维规范 + 四大缓存问题）
Day 7   课后作业收尾 + 复盘总结
```

---

## Day 1 — Redis 概述与核心价值（对应 PPT 第 1 章）

**学习目标**
- 理解 Redis 的定位：基于内存的 KV 存储，微秒级读写，单实例 10 万+ QPS
- 掌握四大核心优势：内存架构、丰富数据结构、单线程 + IO 多路复用、RDB+AOF 双持久化
- 说清楚三大应用场景：缓存加速层、实时计数与排行、分布式锁与队列

**动手任务（作业 1）**
- 用 Docker 搭建 Redis 环境：`docker run -d --name redis -p 6379:6379 redis:7`
- 用 `redis-cli` 完成 `SET / GET / DEL` 基础 CRUD，截图留存

**自测问题**
- 为什么单线程的 Redis 反而快？（无锁竞争 + IO 多路复用 + 纯内存操作）
- Redis 相比磁盘数据库快 10~100 倍的根本原因是什么？

---

## Day 2 — 数据结构（上）：String 与 Hash（对应 PPT 第 2 章）

**学习目标**
- String：`SET/GET`、`INCR/DECR` 原子计数、`SETEX` 带过期时间、`MSET/MGET` 批量
- Hash：`HSET/HGET`、`HGETALL`、`HINCRBY`、`HSCAN`，字段级读写避免整体序列化
- 实战要点：String 单值超 10KB 建议拆或改 Hash；Hash 字段超 1000 建议拆分或改 JSON

**动手任务（作业 2、3）**
- 页面访问计数器：`INCR` 实现按日重置（Key 带日期 + TTL）和总量统计（独立 Key）两种模式
- 用户信息存储：用 Hash 存用户 Profile，实现单字段更新与全量读取，并对比 String 存 JSON 的效率差异

**自测问题**
- 什么场景选 Hash 而不是 String + JSON？（需要字段级原子更新时）
- `INCR` 为什么天然线程安全？

---

## Day 3 — 数据结构（下）：List、Set、ZSet（对应 PPT 第 2 章）

**学习目标**
- List：`LPUSH/RPUSH/LPOP/RPOP` 两端操作，`BLPOP/BRPOP` 阻塞弹出构建轻量消息队列
- Set：`SADD/SMEMBERS/SINTER`，去重与集合运算（共同关注、标签系统）
- ZSet：`ZADD/ZREVRANGE/ZINCRBY`，score 排序，O(logN) 支撑排行榜

**动手任务（作业 4）**
- 热搜排行榜：ZSet 实现添加词条、增加热度、获取 Top 10

**自测问题**
- 用 List 做消息队列有什么局限？（无 ACK、无多消费者组，对比 Pub/Sub 的 fire-and-forget）
- ZSet 为什么适合排行榜？底层是什么结构？（跳表 + 哈希表，可延伸自学）

---

## Day 4 — 持久化机制（对应 PPT 第 3 章）

**学习目标**
- 背出 RDB 与 AOF 的对比表：触发方式、文件格式、恢复速度、数据安全、性能影响、适用场景
- 理解 AOF 的 everysec 刷盘策略（最多丢 1 秒）与 rewrite 机制
- 掌握 Redis 4.0+ 混合持久化（`aof-use-rdb-preamble`）：RDB 嵌入 AOF 头部，兼顾恢复速度与安全

**动手任务（作业 5，可选但建议做）**
- 开启 AOF（`appendonly yes` + `appendfsync everysec`），写入测试数据后重启容器，验证数据完整恢复，保留配置文件

**自测问题**
- RDB fork 子进程时为什么会短暂阻塞？（Copy-on-Write，可延伸自学）
- 生产环境为什么推荐混合持久化而不是单用 AOF？

---

## Day 5 — 高级特性与集群部署（对应 PPT 第 3 章）

**学习目标**
- Pub/Sub：`SUBSCRIBE/PUBLISH/PSUBSCRIBE`；牢记 fire-and-forget，消息不持久化，离线即丢失
- Lua 脚本：`EVAL` + KEYS/ARGV 参数，多条命令服务端原子执行；秒杀库存扣减是典型案例；Redis 6.0+ 用 `EVALSHA` 缓存脚本
- 三种部署方案递进：主从复制（读写分离，手动切换）→ 哨兵模式（Sentinel 自动选主切换）→ Cluster（16384 个哈希槽，在线扩缩容，跨节点操作需 Hash Tag）

**动手任务**
- 用 `EVAL` 写一个「检查库存充足再 DECR」的秒杀扣减脚本
- （可选）Docker 起一主一从，`INFO replication` 观察复制状态

**自测问题**
- 秒杀扣减为什么不能先 GET 再 DECR 分两条命令做？
- 哨兵和 Cluster 都能故障转移，本质区别是什么？（哨兵不管分片，Cluster 管数据分布）

---

## Day 6 — 生产实践（对应 PPT 第 4 章）

**学习目标**

运维四维度：
- 内存管控：`maxmemory` 建议物理内存 70%，淘汰策略 `allkeys-lru`，`INFO memory` 监控
- 连接池：合理配置 `maxTotal`/`maxIdle`（建议 maxIdle 为 maxTotal 的 50%），防止连接耗尽
- 监控告警：内存使用率、命中率（低于 80% 告警）、连接数、慢查询日志
- 开发规范：Key 命名 `业务:模块:id`，TTL 建议不超 30 天，定期清理僵尸数据

四大缓存问题与防御方案（重点，面试高频）：
| 问题 | 成因 | 方案 |
|------|------|------|
| 缓存穿透 | 查询不存在的 Key 直达数据库 | 布隆过滤器 / 空结果缓存短 TTL |
| 缓存雪崩 | 大量 Key 同时过期 | 过期时间加随机偏移 |
| 缓存击穿 | 热点 Key 过期瞬间并发穿透 | 互斥锁，仅一个线程回源 |
| BigKey | 单 Key 过大阻塞主线程 | 拆分为小 Key / 分片存储 |

**动手任务**
- 给 Day 2 的计数器 Key 按 `业务:模块:id` 规范重命名，统一加 TTL
- 写一段伪代码或笔记：用互斥锁（SETNX）解决缓存击穿的完整流程

**自测问题**
- 穿透和击穿的区别？（穿透是查不存在的数据，击穿是热点 Key 恰好过期）
- `allkeys-lru` 和 `volatile-lru` 的区别及各自风险？

---

## Day 7 — 收尾与复盘

1. 检查五项课后作业完成情况（Docker 搭建 / INCR 计数器 / Hash 用户存储 / ZSet 排行榜 / AOF 验证）
2. 不看笔记，默写 RDB vs AOF 对比表、四大缓存问题及方案
3. 串讲一遍完整链路：客户端 → 连接池 → Redis（数据结构选型）→ 持久化 → 高可用部署 → 监控告警

---

## 与现有项目的衔接（可选延伸）

本仓库 `backend/`（FastAPI）中有 `tmp_redis.py` 等 Redis 试用脚本，学完 Day 3 后可尝试：
- 把后端接口的热点数据接入 Redis 缓存，亲手制造并防御一次缓存击穿
- 用 ZSet 给现有接口加一个真实排行榜端点

## 参考资料

- PPT：`redis/Redis 核心技术培训.pptx`
- 官方文档：https://redis.io/docs/
- 命令速查：`redis-cli` 内用 `HELP @string` / `HELP @sorted_set` 按类型查命令
