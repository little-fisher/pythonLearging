# RabbitMQ 命令/代码速查手册

> 配合 `docs/RABBITMQ-PRACTICE-PLAN.md` 使用。基于 pika。
> 核心一句话：**把"现在不用立刻做完的事"挪到后面做**（通知/统计/审计/回调）。
> 管理面板：`http://localhost:15672`，账号 `guest/guest`

---

## 一、三个角色

```
生产者 Producer → 队列 Queue → 消费者 Consumer
（寄信人）        （信箱）      （收信人）
```

- 队列 = 消息的临时仓库：生产者放进去、消费者取走
- 默认交换机 `(AMQP default)`：`exchange=""` + `routing_key=队列名` 直接投进指定队列

---

## 二、生产者骨架（固定 5 步）

```python
import pika, json

# ① 连接（BlockingConnection = 同步等待式，脚本最常用）
conn = pika.BlockingConnection(pika.ConnectionParameters("127.0.0.1"))
# ② 开信道（之后所有操作都走它）
channel = conn.channel()
# ③ 确保队列存在（唯一变量：队列名）
channel.queue_declare(queue="chat.notify", durable=True)

# ④ 发消息（变量：消息内容；routing_key = 队列名）
channel.basic_publish(
    exchange="", routing_key="chat.notify",
    body=json.dumps({"session_id": "s1", "action": "notify"}),
)

# ⑤ 关连接
conn.close()
```

---

## 三、消费者骨架（固定 6 步）

```python
import pika, json

conn = pika.BlockingConnection(pika.ConnectionParameters("127.0.0.1"))
channel = conn.channel()
channel.queue_declare(queue="chat.notify", durable=True)   # 和生产者的 durable 一致！

# ① 定义"收到后干什么"（唯一变量：这里的处理逻辑）
def callback(ch, method, properties, body):
    print("收到:", json.loads(body))
    ch.basic_ack(delivery_tag=method.delivery_tag)          # 确认处理完毕

# ② 注册：把队列喂给 callback
channel.basic_consume(queue="chat.notify", on_message_callback=callback)
# ③ 阻塞等待（有消息自动调 callback）
print("等待消息...")
channel.start_consuming()
```

**记忆口诀**：`Connection`(连) → `channel`(信道) → `queue_declare`(声明队列) → `basic_publish`/`basic_consume`(发/收) → `start_consuming`(跑) / `close`(关)。

---

## 四、可靠性配置

### ack（确认）—— 防"消费者挂了丢消息"

```python
ch.basic_ack(delivery_tag=method.delivery_tag)   # 处理完必须回这一句
```
- 不回 ack 就断开 → RabbitMQ 认为没处理成功 → **消息会重新投递**，不丢
- 实验：把 ack 注释掉再收发，看队列里消息还在不在

### durable（持久化）—— 防"RabbitMQ 重启丢队列/消息"

```python
# 队列声明为持久（生产者、消费者都要一致！）
channel.queue_declare(queue="chat.notify", durable=True)

# 消息标为持久（生产者）
channel.basic_publish(
    exchange="", routing_key="chat.notify", body=...,
    properties=pika.BasicProperties(delivery_mode=2),
)
```

---

## 五、交换机 Exchange（了解）

| 类型 | 行为 | 类比 |
|---|---|---|
| **Direct**（默认） | 按 routing_key 精确匹配 | 挂号信，指名道姓 |
| **Fanout** | 广播给所有绑定队列 | 大喇叭，谁都收到 |
| **Topic** | 按通配符匹配 routing_key | 订阅规则 |

demo 用默认交换机（`exchange=""`）就够了。

---

## 六、常见坑速记

| 坑 | 说明 |
|---|---|
| **406 PRECONDITION_FAILED** | 队列已存在但属性不一致（如面板建的是 durable，代码声明非 durable）。**队列属性一旦创建不可改** → 删队列重建，或让代码和现有队列属性一致 |
| 消费者/生产者 `durable` 不一致 | 同一个队列两边声明参数必须一致，否则 406 |
| 忘写 `basic_ack` | 消息会被反复重新投递（看起来"没消失"） |
| 消息体中文 | 记得用 `json.dumps` 序列化，接收用 `json.loads` |
| `start_consuming()` 卡住 | 正常！它就是"阻塞等待"，要停就 `Ctrl+C` |
| 连不上 5672 | 先确认 `docker start rabbitmq` + 面板能开 |

---

## 七、跑通验证

```bash
# 终端 A（先起消费者，等消息）
python tmp_recv.py        # 显示"等待消息..."

# 终端 B（发消息）
python tmp_send.py        # 显示"已发送"

# 回到终端 A → 打印"收到: {...}"；面板里队列消息数回 0
```
