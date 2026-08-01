# Python 笔记：dict 两种取值方式 `[]` 与 `.get()`

> 来源：P0 热身练习 · backend 练习册
> 场景：`message = {"role": "user", "content": "你好"}`

## 结论

| 写法 | 键不存在时 | 适用 |
|---|---|---|
| `message["key"]` | 抛 `KeyError`（直接炸） | **必需字段**，fail fast |
| `message.get("key")` | 返回 `None`（不报错） | **可选字段**，安静降级 |
| `message.get("key", 默认值)` | 返回指定默认值 | 可选字段 + 默认值 |

## 示例

```python
message = {"role": "user", "content": "你好"}

# 直接索引：键必须存在
message["role"]        # '你好'
message["roles"]       # KeyError: 'roles'   ← 打错键名立刻报错

# .get()：键不存在返回 None
message.get("role")    # '你好'
message.get("roles")   # None（不报错）
message.get("roles", "unknown")   # 'unknown'（指定默认值）
```

## 记忆方法

- `[]`：**"必须要到，没有就炸"**。适合后端自己保证一定存在的字段，万一没拼对能立刻发现 bug（fail fast）。
- `.get()`：**"有就拿，没有拉倒"**。适合可能不存在的可选字段，最好再配一个默认值。

## 项目里的对应场景（P3 会用到）

- 上游 DeepSeek 响应里 `content` / `usage` 是**可选存在**的字段 → 用 `.get("content")` 或先 `if "content" in data` 判断，而不是直接 `data["content"]`，否则某次响应没这个字段时后端直接 500。
- 而我们**自己组装的消息**（`{"role": ..., "content": ...}`）字段一定存在 → 用 `[]` 更合适，组装错了立刻暴露。

## 补充：修改与删除（写操作）

`.get()` 只能**读**，改/删用下面这些：

| 操作 | 写法 | 说明 |
|---|---|---|
| 改已有键 | `d["role"] = "assistant"` | 直接赋值 |
| 批量改 | `d.update({"a": 1, "b": 2})` | 一次改多个键 |
| 新增键 | `d["timestamp"] = "2026-08-01"` | 键不存在时就是新增 |
| 删除键 | `del d["timestamp"]` | 键不存在会 KeyError |
| 安全删除 | `d.pop("timestamp", None)` | 不存在返回默认值，不报错 |

```python
history[0]["role"] = "assistant"              # 改
history[0].update({"role": "user", "content": "更新后的内容"})  # 批量改
history[0]["timestamp"] = "2026-08-01"        # 新增
del history[0]["timestamp"]                   # 删
history[0].pop("timestamp", None)             # 安全删
```

常见笔误：`d.update.update({...})` 是错的——`d.update` 本身就是方法，直接 `d.update({...})`。

**读写删四件套记忆：**

- 读：`d["k"]`（会炸）/ `d.get("k")`（安静）
- 写：`d["k"] = v` 赋值 / `d.update({...})` 批量
- 删：`del d["k"]` / `d.pop("k", 默认)` 安全删

**项目里的实践（P4）：** 对浏览器传来的 `request.history`，一般是**读出来重新构造一份新消息**，而不是原地修改——避免改到别处引用的同一份列表（呼应 `id()` 笔记：原地修改会影响所有引用它的地方）。

## 相关自测

- 为什么说 `message.get("roles")` 对打错的键名 "roles"（应为 `role`）会"静默吞掉"错误？—— 它返回 `None`，程序继续跑，Bug 可能在很后面才暴露，调试更难。
