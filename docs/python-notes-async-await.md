# Python 笔记：`async def` / `await`（协程与并发）

> 来源：P0 热身 · 练习 5 · 自测题第 2 题
> 场景：项目 P3 调 DeepSeek 就是异步网络请求

## 核心概念

- 调用一个 `async def` 函数**不会执行函数体**，只返回一个**协程对象**（coroutine object）。
- 必须把它交给**事件循环**（event loop）调度，用 `asyncio.run(...)` 或 `await` 才能真正执行。
- `await` 会"挂起"当前协程，等 IO 完成再恢复——期间事件循环可以去跑别的协程。

```python
import asyncio

async def get_reply(message: str) -> str:
    print("开始调用模型...")
    await asyncio.sleep(0.5)          # 模拟耗时 IO（真实场景是请求 DeepSeek）
    return f"回复：{message}"

get_reply("你好")                     # 不会执行！只返回 <coroutine object ...>
result = asyncio.run(get_reply("你好"))  # 交给事件循环才真正执行
print(result)                         # 回复：你好
```

类比：普通函数 = 点外卖立刻拿到；async = 下单（创建协程）→ 等骑手（await）→ 送达（事件循环恢复）。

## 串行 vs 并发（`asyncio.gather`）

**串行写法**——两条消息一前一后，总耗时 ≈ 0.5 + 0.5 = 1 秒：

```python
async def main():
    r1 = await get_reply("第一句话")
    r2 = await get_reply("第二句话")   # 等 r1 返回了才开始
    return r1, r2

r1, r2 = asyncio.run(main())
print(r1)
print(r2)
```

**并发写法（gather）**——两条同时等待，总耗时 ≈ 0.5 秒：

```python
async def main():
    r1, r2 = await asyncio.gather(
        get_reply("第一句话"),
        get_reply("第二句话"),
    )
    return r1, r2

r1, r2 = asyncio.run(main())
print(r1)
print(r2)
```

观察：并发版"开始调用模型..."会先打印两次（两个协程都启动了），然后一起返回结果。

## 自测题第 2 题答案

> `async def` 定义的函数为什么不能像普通函数一样直接得到结果？

因为它是**协程**：调用它只创建"任务说明书"（coroutine 对象），必须由事件循环调度，靠 `await` 挂起等待 IO、再恢复，才能拿到结果。直接调用不会执行函数体。

## 踩坑记录：REPL 里怎么敲多行块

Python 语法规定冒号 `:` 后是**缩进的代码块**，每条语句独占一行，不能塞进同一行：

```python
async def main(): r1 = ... r2 = ... return ...   # ❌ SyntaxError
```

正确交互（`→` 表示按回车）：

```
async def main(): →                    (回车后出现 ...)
    r1 = await get_reply("第一句话") →   (4 空格缩进 + 回车)
    r2 = await get_reply("第二句话") →   (4 空格缩进 + 回车)
    return r1, r2 →                     (4 空格缩进 + 回车)
→                                       (空行回车，结束定义，回到 >>>)
r1, r2 = asyncio.run(main()) →
print(r1) →
print(r2) →
```

口诀：
- 冒号后面 = 缩进块，每句一行
- `...` 提示符 = 还在块里，等缩进内容
- 空行回车 = 告诉 REPL "块写完了"

3 行以上的多行块，也可以写成 `.py` 文件再 `python 文件.py` 运行，更省心。
