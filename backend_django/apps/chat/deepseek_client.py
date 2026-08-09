from openai import OpenAI
from django.conf import settings
# 其实没用上这个文件

API_KEY = settings.DEEPSEEK_API_KEY
MODEL = settings.DEEPSEEK_MODEL

BASE_URL = "https://api.deepseek.com"

def get_client() -> OpenAI:
    if not API_KEY:
        raise ValueError('DEEPSEEK_API_KEY is not 未设置')
    return OpenAI(api_key=API_KEY, base_url=BASE_URL)

def chat_completion(
        messages: list[dict],
)-> tuple[str, dict[str, int] | None]:
    client = get_client()
    resp = client.chat.completions.create(
        model = MODEL,
        messages = messages
    )
    if not resp.choices:
        raise ValueError('DeepSeek API 未返回任何 choices')
    content = resp.choices[0].message.content
    if not content:
        raise ValueError('DeepSeek API 未返回任何内容')
    usage: dict[str, int] | None = None
    if resp.usage:
        usage = {
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
            "total_tokens": resp.usage.total_tokens,
        }
    return content, usage
