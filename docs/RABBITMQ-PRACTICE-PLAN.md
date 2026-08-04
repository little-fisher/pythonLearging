# RabbitMQ 从零练习计划（配合你的 Docker 容器）

> 前置：`rabbitmq` 容器已启动（`docker start rabbitmq`）
> 管理面板：浏览器 `http://localhost:15672`，账号 `guest/guest`
> 目标：4 天把"生产者 / 队列 / 消费者 / ack / 异步任务"过一遍，练完能在你的 FastAPI 里把通知/统计拆成异步。
> 这份计划是 `PHASE2-PLAN.md` 模块 5 的前置课。**核心一句话：把"现在不用立刻做完的事"挪到后面做。**

---

## 0. 三个角色的直觉

RabbitMQ 是"邮局 + 信箱"模型：

```
生产者（寄信人）→ 队列（信箱）→ 消费者（收信人）
```

- **生产者 Producer**：往队列里发消息
- **队列 Queue**：暂存消息（等消费者来拿）
- **消费者 Consumer**：从队列取消息并处理

**为什么需要它**：接口不该同步干完所有事。比如发消息后要"发通知/统计/审计"——这些慢活丢进队列，接口立刻返回，消费者慢慢处理。

---

## 阶段 1：认识 RabbitMQ — 第 1 天

**学什么**：先不上代码，去管理面板"看见"队列。

1. 浏览器开 `http://localhost:15672`，登录 `guest/guest`
2. 点 **Queues and Streams** → 看到一个队列都没有（正常，还没建）
3. 点 **Exchanges and Streams** → 能看到默认交换机 `(AMQP default)`

**自己手动建一个队列**（在面板里操作，先感受）：
- Queues → Add a new queue → 名字填 `chat.notify` → Add queue
- 建好后在列表里能看到它，0 个消息

**理解**：队列是"消息的临时仓库"。生产者在面板里点 Queue 能 `Publish message`，消费者拿到消息后它才消失。

**验收**：能在面板里新建一个队列，并说出"队列是干嘛的"。

---

## 阶段 2：第一个 producer / consumer（pika）— 第 2 天

依赖先装好（`backend/.venv` 里）：`pip install pika`

**生产者**（建 `tmp_send.py`）：
```python
import pika, json

conn = pika.BlockingConnection(pika.ConnectionParameters("127.0.0.1"))
channel = conn.channel()
channel.queue_declare(queue="chat.notify")          # 确保队列存在

channel.basic_publish(
    exchange="", routing_key="chat.notify",          # 发到默认交换机 → 指定队列
    body=json.dumps({"session_id": "s1", "action": "notify"}),
)
print("已发送")
conn.close()
```

**消费者**（建 `tmp_recv.py`，跑起来会一直等着收）：
```python
import pika, json

conn = pika.BlockingConnection(pika.ConnectionParameters("127.0.0.1"))
channel = conn.channel()
channel.queue_declare(queue="chat.notify")

def callback(ch, method, properties, body):
    print("收到:", json.loads(body))
    ch.basic_ack(delivery_tag=method.delivery_tag)   # 确认处理完了

channel.basic_consume(queue="chat.notify", on_message_callback=callback)
print("等待消息...")
channel.start_consuming()                            # 阻塞，等消息
```

**跑法**（开两个终端）：
1. 终端 A：`python tmp_recv.py` → 显示"等待消息..."
2. 终端 B：`python tmp_send.py` → 显示"已发送"
3. 回到终端 A → 打印"收到: {'session_id': 's1', 'action': 'notify'}"
4. 面板里看 `chat.notify` 队列，消息数又变回 0（被消费了）

**验收**：能跑通"发送 → 收到 → ack"闭环，并看懂 `basic_ack` 是干嘛的。

---

## 阶段 3：ack 与持久化 — 第 3 天

**学什么**：消息可靠性——**消费者挂了 / 队列重启，消息不能丢**。

**① ack 是什么**：消费者处理完必须回一句"我搞定了"（`basic_ack`）。如果没回 ack 就断了，RabbitMQ 会把这条消息**重新投给别的消费者**，保证不丢。

**实验**：把 `tmp_recv.py` 里的 `basic_ack` 那行注释掉，重跑一遍收发——你会发现队列里的消息**没消失**（等 ack）。这就是"没确认 = 当没处理成功"。

**② 持久化**：默认队列和消息都在内存，RabbitMQ 一重启就没了。要加两处：

```python
# 生产者/消费者都要：队列声明为 durable
channel.queue_declare(queue="chat.notify", durable=True)

# 生产者：消息标为 persistent
channel.basic_publish(
    exchange="", routing_key="chat.notify",
    body=..., properties=pika.BasicProperties(delivery_mode=2),
)
```

改完后，重启 rabbitmq 容器（`docker restart rabbitmq`）再收发，消息还在。

**验收**：能说出"ack 防止消费者挂掉丢消息，durable + delivery_mode=2 防止重启丢消息"。

---

## 阶段 4：交换机 Exchange（了解即可）— 第 3 天

**学什么**：队列不是直接收消息，中间还有个"交换机"决定消息去哪。

| 类型 | 行为 | 类比 |
|---|---|---|
| **Direct**（默认） | 按 routing_key 精确匹配到队列 | 挂号信，指名道姓 |
| **Fanout** | 广播给所有绑定的队列 | 大喇叭，谁都收到 |
| **Topic** | 按通配符匹配 routing_key | 订阅规则 |

**先不用深究**——你 demo 用默认交换机（`exchange=""`）直接指定队列就够了。知道有这回事，等要"一条消息发给多个队列"时再学 Fanout/Topic。

**验收**：能说出"交换机是消息的中转站，Direct 精确、Fanout 广播"即可。

---

## 阶段 5：异步任务实战 — 第 4 天

**学什么**：把"通知/统计"从接口里拆出来，接口先返回。

**改造思路**（对应 PHASE2 模块 5/6）：
```
用户发消息
  → FastAPI 接口：写 MySQL + 立即返回
  → 同时 publish 一条任务到 chat.notify
  → 后台 consumer 收到后慢慢处理（打印/统计/审计）
```

**练习**：把你 `main.py` 的 `/api/chat` 里，加一步"发完消息后，往 `chat.notify` 投一条任务"（异步部分），消费者收到后打印 `"处理异步通知: session=..."`。接口本身不等待消费者。

**关键理解**：
- 用户等待的：消息写库 + 返回回答 → **同步**，接口当场做完
- 用户不等的：通知/统计/回调 → **异步**，丢进队列让消费者慢慢干

**验收**：能说清"为什么通知/统计不该阻塞接口返回"，并跑通"接口发任务 → 消费者后台处理"。

---

## 阶段 6：综合 = 串进你的聊天接口（第 4 天）

把阶段 5 做完整，最终达成 PPT 的作业链路：

```
用户发消息
  → 接口先返回
  → 消息写 MySQL（chat_message）
  → 最近几轮写 Redis（带 EXPIRE）
  → 任务投 RabbitMQ（chat.notify）
  → 消费者异步处理（打印/统计）
```

（MySQL 你会了，Redis 见 `REDIS-PRACTICE-PLAN.md`，RabbitMQ 见本计划——三者串起来就是 PHASE2 模块 6。）

**验收（最终）**：浏览器发一条消息 → 接口正常返回，同时 RabbitMQ 面板 `chat.notify` 出现消息并被消费，消费者终端打印出异步处理记录。

---

## 节奏 & 自查

| 天 | 阶段 | 自测题 |
|---|---|---|
| 1 | 认识 | 三个角色？队列是干嘛的？ |
| 2 | 第一个收发 | producer/consumer 各写哪几行？ack 干嘛的？ |
| 3 | 可靠性 | 不 ack 会怎样？重启不丢消息要配什么？ |
| 4 | 异步实战 + 综合 | 什么该同步什么该异步？ |

**每天 30–60 分钟，自己敲**。卡住把报错/面板截图发我。想清空队列：面板里点队列 → Purge messages。
