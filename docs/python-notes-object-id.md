# Python 笔记：`id()` 与"对象身份"（列表原地修改）

> 来源：P0 热身 · 自测题第 1 题：`history.append(message)` 会不会创建新列表？

## 核心概念

- Python 里**万物皆对象**：列表、字典、字符串、甚至整数，都是对象。
- 每个对象有唯一标识 `id(obj)`（CPython 里就是它的**内存地址**）。
- `id(history)` 是**列表这个容器对象本身**的标识，不是里面每个 item 的标识。

```
history  (一个列表对象，有自己的 id)
 ├── [0] → {"role": "user", ...}        (另一个 dict 对象，自己的 id)
 ├── [1] → {"role": "assistant", ...}   (又一个 dict 对象，自己的 id)
 └── [2] → {"role": "user", ...}
```

列表里存的其实是**指向各个 item 对象的引用**，列表本身是独立的容器。

## 示例

```python
history = [{"role": "user", "content": "你好"}]

id(history)        # 列表对象本身的 id
id(history[0])     # 第一个元素（dict）的 id —— 与上面不同
history.append({"role": "user", "content": "再问一句"})
id(history)        # 与第一次相同 → append 是原地修改，没有创建新列表
len(history)       # 2
```

对比：**新建**一个列表会得到新 id

```python
new_history = history + [{"role": "user", "content": "x"}]
id(new_history)    # 与 id(history) 不同 → 这是新对象
```

## 结论（自测题答案）

- `list.append(x)`：**原地修改**同一个列表对象，`id` 不变，**不创建新列表**。
- `list + [x]` 或 `list.copy()`：**创建新列表对象**，`id` 会变。

这也是为什么项目里往 `history` 里不断 `append` 消息是安全的——始终操作同一个列表。

## 延伸：可变 vs 不可变

- 列表、字典是**可变**的（可原地修改，`id` 不变）。
- 字符串、元组、数字是**不可变**的（任何"修改"都会产生新对象，`id` 改变）：

```python
s = "abc"
id(s)          # A
s += "d"       # 字符串拼接
id(s)          # B ≠ A → 产生了新字符串
```
