# deepseek_client.py —— 职责单一：只负责"调用 DeepSeek 模型"
# 输入：消息列表 list[dict[str, str]]（role/content 对象）
# 输出：回答文本 + 可选用量 tuple[str, dict[str, int] | None]
# 不做：不处理 FastAPI Request，不把完整上游响应返回浏览器
from decouple import config # 从 .env 读取环境变量
from openai import OpenAI        # 官方 OpenAI 兼容客户端（DeepSeek 兼容）


# 2) 用 config 取 Key 和 Model（第二个参数是默认值）
API_KEY = config("DEEPSEEK_API_KEY")
MODEL = config("DEEPSEEK_MODEL", default="deepseek-v4-flash")

def get_client() -> OpenAI:
   # 3) 任一缺失或还是占位符时，给出明确错误，而不是让 DeepSeek 返回看不懂的鉴权错误
   if not API_KEY or API_KEY == "replace-with-your-key":
       raise ValueError("DEEPSEEK_API_KEY is not set")
   # 4) 创建 OpenAI 兼容客户端，Base URL 指向 DeepSeek
   return OpenAI(api_key=API_KEY,  base_url="https://api.deepseek.com")

def chat_completion(
        message: list[dict[str, str]],
) -> tuple[str, dict[str, int] | None]:
    # 5) 调用 chat completions：传入消息列表 + 模型名
    client  = get_client()
    resp = client.chat.completions.create(model=MODEL, messages=message)

    # 6) 检查 choices 和 content 是否存在（上游响应可能为空，不能盲取）
    if not resp.choices:
        raise RuntimeError("No choices returned from DeepSeek API")
    content = resp.choices[0].message.content
    if not content:
        raise RuntimeError("No content returned from DeepSeek API")

    # 组装可选的 usage（用量可能不存在 → 用 if 判断，而不是直接取）
    usage: dict[str, int] | None = None
    if resp.usage:
        usage = {
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
            "total_tokens": resp.usage.total_tokens,
        }
    # 7) 只把"安全的回答文本 + 用量"交出去，完整上游响应不返回浏览器
    return content, usage
