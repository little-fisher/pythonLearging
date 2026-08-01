# Python 笔记：`.env` / `load_dotenv()` / `os.getenv()`（配置读取）

> 来源：P0 热身 · 练习 6 · 踩坑记录
> 场景：项目 P3 读 DeepSeek API Key

## 三个角色

| 名字 | 是什么 | 作用 |
|---|---|---|
| `os` | Python 标准库模块（Operating System） | 提供跟操作系统交互的函数 |
| `os.environ` | 进程里的"环境变量字典" | 环境变量的存放处 |
| `os.getenv("名字")` | `os` 模块里的函数 | 从 `os.environ` 取值，没有返回 `None` |
| `load_dotenv()` | `python-dotenv` 库的函数（需安装） | 把 `.env` 文件读进 `os.environ` |

**流程（先倒后取）：**

```
backend/.env 文件
      │  load_dotenv()   ← 把文件里的键值倒进环境变量
      ▼
os.environ（进程的环境变量字典）
      │  os.getenv("DEEPSEEK_API_KEY")
      ▼
'你的key'
```

```python
import os
from dotenv import load_dotenv

load_dotenv()                          # 读 .env，找到返回 True
key = os.getenv("DEEPSEEK_API_KEY")    # 没设置返回 None（不报错）
model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")  # 带默认值
```

## 为什么需要 `.env`，而不是写死在代码里

1. Key 写死在源码 = 泄露风险（前端 JS 更是直接暴露给浏览器）；
2. `.env` 在 `.gitignore` 里，不会提交到 GitHub；
3. 换 Key / 换机器只改 `.env`，不动代码。

## 明确报错模式（P3 用）

占位符和"没配置"要一起拦住：

```python
key = os.getenv("DEEPSEEK_API_KEY")
if not key or key == "replace-with-your-key":
    raise RuntimeError("请在 backend/.env 中配置真实的 DEEPSEEK_API_KEY")
```

## 踩坑记录：改了 `.env` 为什么打印还是旧值？

**现象：** 在 REPL 里 `load_dotenv()` 后取到 `'replace-with-your-key'`，去 `.env` 填了真实 Key，再打印还是旧值。

**原因（两个机制叠加）：**
1. `load_dotenv()` 只在**当前进程启动后读一次**，读进去的值留在 `os.environ` 里；之后改文件不会回头更新已运行的进程。
2. `load_dotenv()` **默认 `override=False`**——即使再跑一次，也不会覆盖进程里已有的同名环境变量。

**解决：重启进程（新进程重新读 `.env`）：**

```
exit()          # 或按 Ctrl+D 退出 REPL
python          # 重新进入
import os
from dotenv import load_dotenv
load_dotenv()
key = os.getenv("DEEPSEEK_API_KEY")
print(repr(key))
```

> `load_dotenv(override=True)` 可以不重启强制覆盖，但实践中推荐"改完配置就重启进程"，更符合直觉，不留脏状态。

**一句话记忆：** 环境变量是"进程启动时定下来的状态"，`.env` 文件只是它的"进货来源"，进货一次，之后改仓库不补货。

## 安全提醒

- `.env` 已在 `.gitignore`，不会提交（已验证）。 ✅
- 如果 Key 曾出现在聊天记录 / 截图里被同步到云端，建议去平台**重新生成**。
