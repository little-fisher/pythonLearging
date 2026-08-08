# Django 重写计划：Agent Lab

> 目标：用 Django + DRF + Celery(RabbitMQ) + Redis 重写当前 FastAPI 项目。
> 参考项目：`/Users/aiyi/Documents/python项目/youlin/backend`（企业费控系统，Django + DRF + MySQL + Redis + MinIO + 企微OAuth）
>
> 每条练习卡的要求：能解释 **输入是什么、输出是什么、状态在哪里**。

---

## 架构对比

| 维度 | 当前（FastAPI） | 目标（Django） |
|---|---|---|
| Web 框架 | FastAPI + uvicorn | Django + DRF |
| 数据校验 | Pydantic BaseModel | DRF Serializer |
| ORM | 裸 SQL（mysql-connector） | Django ORM + migrations |
| 异步任务 | pika 练习脚本（未集成） | Celery + RabbitMQ |
| 缓存 | redis-py 练习脚本（未集成） | Django Cache + Redis |
| LLM 对话 | LangGraph + langchain-deepseek | 保留 LangGraph，配置集中到 settings.py |
| 项目结构 | 扁平 app/ 包 | config/ + apps/ 多应用 |

---

## 目标目录结构

```
backend_django/
├── manage.py
├── requirements.txt
├── .env.example
├── config/                     # Django 项目配置包
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py                 # 根路由
│   ├── wsgi.py
│   ├── asgi.py
│   └── celery.py               # Celery 应用定义
├── apps/
│   └── chat/                   # 聊天核心应用
│       ├── __init__.py
│       ├── models.py           # Session 模型（Django ORM）
│       ├── serializers.py      # DRF 序列化器
│       ├── views.py            # API 视图
│       ├── urls.py             # 应用内路由
│       ├── deepseek_client.py  # DeepSeek 客户端（几乎不改）
│       ├── graph.py            # LangGraph 图（几乎不改）
│       └── tasks.py            # Celery 异步任务
├── utils/
│   └── __init__.py
└── frontend/                   # 现有前端不变，复制过来即可
    ├── index.html
    ├── app.js
    └── styles.css
```

---

## D0｜环境准备（30 分钟）

### 目标
创建 Django 项目骨架，跑通 `runserver`。

### 步骤

```bash
# 1. 创建项目目录
mkdir -p ~/Documents/python项目/learning/backend_django
cd ~/Documents/python项目/learning/backend_django

# 2. 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 3. 安装依赖
pip install django djangorestframework django-cors-headers django-redis \
            celery python-decouple pymysql cryptography \
            openai langgraph langchain-deepseek \
            langgraph-checkpoint-mysql redis pika

# 4. 创建 Django 项目（注意末尾的句点，表示在当前目录创建）
django-admin startproject config .

# 5. 创建 chat 应用
mkdir -p apps
python manage.py startapp chat apps/chat
```

### 验收
```bash
python manage.py runserver  # 看到 "Starting development server at http://127.0.0.1:8000/"
```

### 此时结构
```
backend_django/
├── manage.py
├── config/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
└── apps/
    └── chat/
        ├── __init__.py
        ├── admin.py
        ├── apps.py
        ├── models.py
        ├── tests.py
        └── views.py
```

### 解释题
1. `django-admin startproject config .` 末尾的句点是什么意思？
2. `startapp chat apps/chat` 和 `startapp chat` 的区别？
3. `config/` 和 `apps/chat/` 各自职责是什么？（参考 youlin 项目的 `config/expenses/` 和 `apps/expenses/`）

---

## D1｜配置 settings.py + 第一个视图（45 分钟）

### 目标
配置好 settings.py，写出 `GET /health`，感受 Django 的请求-响应周期。

### D1-1：settings.py 关键配置

参考 `youlin/backend/config/settings.py`，在 `config/settings.py` 中修改：

```python
# 1. 环境变量（用 python-decouple，参考 youlin）
from decouple import config as env_config

SECRET_KEY = env_config('SECRET_KEY', default='dev-secret-key-change-me')
DEBUG = env_config('DEBUG', default=True, cast=bool)

# 2. INSTALLED_APPS 追加
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 第三方
    'rest_framework',
    'corsheaders',
    # 业务应用
    'apps.chat',
]

# 3. MIDDLEWARE 中 CORS 放最前面（参考 youlin）
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # ← 必须第一
    # ... 其余默认 middleware 保留 ...
]

# 4. 数据库（先用 SQLite，后面切 MySQL）
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# 5. 国际化（参考 youlin）
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_TZ = False

# 6. DRF 默认配置
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}
```

### D1-2：第一个视图 —— GET /health

在 `apps/chat/views.py`：

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def health(request):
    return Response({"status": "ok", "service": "agent-lab-django"})
```

在 `apps/chat/urls.py`（新建）：

```python
from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
]
```

在 `config/urls.py` 中挂载：

```python
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('apps.chat.urls')),
]
```

### 验收
```bash
curl -i http://127.0.0.1:8000/api/health/
# 注意 Django 默认 URL 末尾有斜杠
```

### 解释题
1. `@api_view` 装饰器做了什么？（对比 FastAPI 的 `@app.get`）
2. Django 的 `path('health/', ...)` 和 FastAPI 的 `@app.get('/health')` 有什么本质区别？
3. `include('apps.chat.urls')` 的作用？为什么 youlin 项目用了一层 `api_urls.py` 做聚合？

---

## D2｜DRF Serializer（相当于原 P2，45 分钟）

### 目标
用 DRF Serializer 替代 Pydantic，实现 ChatMessage / ChatRequest / ChatResponse 的数据校验。

### 在 `apps/chat/serializers.py` 中创建：

```python
from rest_framework import serializers

class ChatMessageSerializer(serializers.Serializer):
    ROLE_CHOICES = ['user', 'assistant']
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    content = serializers.CharField(min_length=1)

class UsageInfoSerializer(serializers.Serializer):
    prompt_tokens = serializers.IntegerField()
    completion_tokens = serializers.IntegerField()
    total_tokens = serializers.IntegerField()

class ChatRequestSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    message = serializers.CharField(min_length=1)
    history = serializers.ListField(
        child=ChatMessageSerializer(),
        default=list,      # ← 不是 default=[]，DRF 中这样写是安全的
    )
    context_mode = serializers.ChoiceField(
        choices=['client_history', 'graph_memory'],
    )
    title = serializers.CharField(required=False, allow_blank=True)

class ChatResponseSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    message = ChatMessageSerializer()
    usage = UsageInfoSerializer(required=False, allow_null=True)
```

### 对照理解

| Pydantic (FastAPI) | DRF Serializer (Django) |
|---|---|
| `BaseModel` | `serializers.Serializer` |
| `Literal['user','assistant']` | `ChoiceField(choices=[...])` |
| `Field(default_factory=list)` | `default=list` |
| `str \| None` | `required=False, allow_null=True` |
| 类型注解驱动 | 字段类型显式声明 |
| `model_dump()` | `serializer.validated_data` |

### 验收
写一个临时视图测试校验：

```python
@api_view(['POST'])
def validate_test(request):
    serializer = ChatRequestSerializer(data=request.data)
    if serializer.is_valid():
        return Response(serializer.validated_data)
    return Response(serializer.errors, status=422)
```

用 curl 发送 role=system 的请求，应返回 422。

### 解释题
1. DRF 的 `serializer.is_valid()` 和 Pydantic 的自动校验有什么区别？
2. 为什么 `default=list` 在 DRF 中是安全的（不像 Python 的 `default=[]`）？

---

## D3｜DeepSeek 客户端迁移（30 分钟）

### 目标
把 `deepseek_client.py` 从 FastAPI 项目迁移过来，几乎不改代码，只调整配置读取方式。

### 步骤

直接把 `backend/app/deepseek_client.py` 复制到 `apps/chat/deepseek_client.py`。

唯一需要改的：用 Django 的 settings 替代 `os.getenv` + `load_dotenv`。

**方式 A（推荐，和 youlin 一致）**：继续用 `python-decouple`：

```python
from decouple import config

DEEPSEEK_API_KEY = config('DEEPSEEK_API_KEY')
DEEPSEEK_MODEL = config('DEEPSEEK_MODEL', default='deepseek-chat')
```

**方式 B**：通过 Django settings（更 Django 化）：

```python
from django.conf import settings

DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
```

然后在 `config/settings.py` 中：

```python
DEEPSEEK_API_KEY = env_config('DEEPSEEK_API_KEY')
DEEPSEEK_MODEL = env_config('DEEPSEEK_MODEL', default='deepseek-chat')
```

### 验收
```bash
python manage.py shell
>>> from apps.chat.deepseek_client import chat_completion
>>> content, usage = chat_completion([{"role": "user", "content": "你好"}])
>>> print(content)
```

---

## D4｜POST /api/chat —— client_history 模式（相当于原 P4，1 小时）

### 目标
在 Django 中实现多轮对话路由，逻辑和原 `main.py` 的 `client_history` 分支完全一致。

### 在 `apps/chat/views.py` 中：

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .serializers import ChatRequestSerializer, ChatResponseSerializer
from .deepseek_client import chat_completion

@api_view(['POST'])
def chat(request):
    # 1. 校验请求
    req_serializer = ChatRequestSerializer(data=request.data)
    req_serializer.is_valid(raise_exception=True)
    req = req_serializer.validated_data

    # 2. 模式检查
    if req['context_mode'] != 'client_history':
        return Response(
            {'detail': 'Day 1 仅支持 client_history 模式'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 3. 拼消息
    messages = [
        {'role': m['role'], 'content': m['content']}
        for m in req['history']
    ]
    messages.append({'role': 'user', 'content': req['message']})

    # 4. 调模型
    try:
        content, usage = chat_completion(messages)
    except Exception:
        return Response(
            {'detail': '模型调用失败，请稍后重试'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # 5. 组装响应
    resp_data = {
        'conversation_id': req['conversation_id'],
        'message': {'role': 'assistant', 'content': content},
        'usage': usage,
    }
    resp_serializer = ChatResponseSerializer(data=resp_data)
    resp_serializer.is_valid(raise_exception=True)
    return Response(resp_serializer.data)
```

在 `apps/chat/urls.py` 追加：

```python
urlpatterns = [
    path('health/', views.health, name='health'),
    path('chat/', views.chat, name='chat'),
]
```

### FastAPI → Django 对照

| FastAPI | Django + DRF |
|---|---|
| `req: ChatRequest` 自动校验 | `serializer.is_valid(raise_exception=True)` |
| `HTTPException(status_code=400)` | `Response(..., status=400)` |
| 返回 Pydantic 对象，自动序列化 | 返回 `Response(serializer.data)` |
| `@app.post('/api/chat')` | `@api_view(['POST'])` + `path('chat/', ...)` |

### 验收
```bash
curl -X POST http://127.0.0.1:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-001",
    "message": "你好",
    "history": [],
    "context_mode": "client_history"
  }'
```
应返回 200 带 assistant 回复。

### 解释题
1. `raise_exception=True` 做了什么？和 FastAPI 的自动 422 对比？
2. 为什么 Django 视图中要手动 `try/except`，而 FastAPI 可以全局 exception handler？

---

## D5｜CORS + 前端联调（相当于原 P5，30 分钟）

### 目标
配置 CORS，让现有前端能对接 Django 后端。

### 在 `config/settings.py` 中：

```python
# CORS（只允许前端开发服务器）
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_CREDENTIALS = True

# 如果 DRF 的 DEFAULT_RENDERER_CLASSES 没配，加上：
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
    ],
}
```

### 验收
1. 前端切换到 API 模式，把后端 URL 改为 `http://127.0.0.1:8000/api/chat/`
2. 浏览器 Network 中 OPTIONS 预检不报错
3. POST 返回 200

---

## D6｜Django ORM + MySQL（相当于原 D4，1.5 小时）

### 目标
用 Django ORM 替代裸 SQL，管理 sessions 表。

### D6-1：定义 Model

在 `apps/chat/models.py`：

```python
from django.db import models

class Session(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    title = models.CharField(max_length=100, default='未命名会话')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sessions'
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.id}: {self.title}'
```

### D6-2：切换到 MySQL

在 `config/settings.py` 中（参考 youlin 的 DATABASES 配置）：

```python
import pymysql
pymysql.install_as_MySQLdb()

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': env_config('DB_NAME', default='agent_lab'),
        'USER': env_config('DB_USER', default='root'),
        'PASSWORD': env_config('DB_PASSWORD', default=''),
        'HOST': env_config('DB_HOST', default='127.0.0.1'),
        'PORT': env_config('DB_PORT', default='3306'),
        'OPTIONS': {'charset': 'utf8mb4'},
    }
}
```

### D6-3：生成 migration + 迁移

```bash
python manage.py makemigrations chat
python manage.py migrate
```

### D6-4：用 ORM 重写会话相关视图

在 `apps/chat/views.py` 中：

```python
from .models import Session

@api_view(['GET'])
def list_conversations(request):
    sessions = Session.objects.values('id', 'title', 'created_at', 'updated_at')
    return Response(list(sessions))

@api_view(['DELETE'])
def delete_conversation(request, conversation_id):
    try:
        session = Session.objects.get(id=conversation_id)
        session.delete()
        return Response({'deleted': conversation_id})
    except Session.DoesNotExist:
        return Response(
            {'detail': 'Conversation not found'},
            status=status.HTTP_404_NOT_FOUND,
        )
```

### 对照理解

| 原 FastAPI（裸 SQL） | Django ORM |
|---|---|
| `conn = db.get_db_connection()` | 自动连接管理 |
| `cur.execute("SELECT ...")` | `Session.objects.values(...)` |
| `cur.fetchall()` | `list(queryset)` |
| `cur.execute("INSERT IGNORE ...")` | `Session.objects.get_or_create(...)` |
| `cur.execute("DELETE ... WHERE id=%s")` | `session.delete()` |
| 手动 commit/close | 自动事务 + 连接池 |

### 解释题
1. `python manage.py makemigrations` 做了什么？为什么不需要手写 SQL？
2. `Session.objects.values(...)` vs `Session.objects.all()` 的区别？
3. Django ORM 的 `auto_now` 和 `auto_now_add` 分别对应原 schema.sql 的什么？

---

## D7｜Redis 缓存集成（1 小时）

### 目标
用 Django Cache 框架 + Redis 实现：
1. 会话列表缓存（减少 DB 查询）
2. 近期消息缓存（替代 `tmp_redis.py` 的练习）

### D7-1：安装配置

```bash
pip install django-redis
```

在 `config/settings.py` 中（参考 youlin 的 CACHES 配置）：

```python
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': env_config('REDIS_URL', default='redis://127.0.0.1:6379/1'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}
```

### D7-2：在视图中使用缓存

```python
from django.core.cache import cache

@api_view(['GET'])
def list_conversations(request):
    cache_key = 'conversations:list'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    sessions = Session.objects.values('id', 'title', 'created_at', 'updated_at')
    data = list(sessions)
    cache.set(cache_key, data, timeout=30)  # 30 秒过期
    return Response(data)
```

### D7-3：近期消息缓存（替代 tmp_redis.py）

在 `apps/chat/views.py` 的 `chat` 函数末尾：

```python
# 缓存最近消息（保留最近 20 条）
msg_cache_key = f'chat:recent:{req["conversation_id"]}'
recent = cache.get(msg_cache_key, [])
recent.append({
    'role': 'user',
    'content': req['message'],
})
recent.append({
    'role': 'assistant',
    'content': content,
})
# 只保留最近 20 条（8 轮对话）
cache.set(msg_cache_key, recent[-20:], timeout=3600)
```

### 验收
```bash
redis-cli
> KEYS *             # 应能看到 conversations:list 和 chat:recent:* 键
> TTL conversations:list  # 应返回剩余秒数
```

### 解释题
1. Django Cache 的 `cache.set('k', v, timeout=30)` 和 redis-py 的 `setex('k', 30, v)` 有什么不同？
2. 为什么 youlin 项目在 DEBUG 模式下回退到 `LocMemCache` 而不是强制 Redis？

---

## D8｜Celery + RabbitMQ 异步任务（1.5 小时）

### 目标
用 Celery + RabbitMQ 替代 `tmp_send.py` / `tmp_recv.py` 练习脚本，实现：
1. 每次聊天后异步发送通知
2. 一个简单的结果查询任务

### 核心概念

```
Django View → Celery Task → RabbitMQ → Celery Worker → 执行/回调
```

| 原练习（pika） | Celery |
|---|---|
| 手动 `basic_publish` / `basic_consume` | `@shared_task` 装饰器 |
| 自己写 JSON 序列化 | 自动序列化 |
| 手动 ack/nack | 自动确认 |
| 没有重试机制 | 内置重试（`max_retries`） |

### D8-1：安装配置

```bash
pip install celery
```

### D8-2：创建 `config/celery.py`（参考 youlin）

```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('agent_lab')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

在 `config/settings.py` 中追加：

```python
# Celery + RabbitMQ 配置
CELERY_BROKER_URL = env_config('RABBITMQ_URL', default='amqp://guest:guest@127.0.0.1:5672//')
CELERY_RESULT_BACKEND = 'rpc://'          # 结果也通过 RabbitMQ 回传
CELERY_TIMEZONE = 'Asia/Shanghai'
CELERY_TASK_TIME_LIMIT = 300
CELERY_TASK_SOFT_TIME_LIMIT = 240
```

### D8-3：创建第一个 Task

在 `apps/chat/tasks.py`：

```python
from celery import shared_task
from django.core.cache import cache

@shared_task
def notify_after_chat(conversation_id: str, user_message: str):
    """
    聊天后异步任务：可以发通知、写日志、触发后续流程。
    目前只打印 + 更新缓存计数器。
    """
    counter_key = f'chat:counter:{conversation_id}'
    count = cache.get(counter_key, 0)
    cache.set(counter_key, count + 1, timeout=None)

    print(f'[Celery] conversation={conversation_id} '
          f'msg={user_message[:30]}... count={count + 1}')
    return count + 1

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def summarize_conversation(self, conversation_id: str):
    """
    模拟：对长对话做摘要。失败自动重试 3 次。
    """
    try:
        # 这里可以调 LLM 做摘要
        return f'Summary for {conversation_id}'
    except Exception as exc:
        raise self.retry(exc=exc)
```

### D8-4：在视图中调用 Task

修改 `apps/chat/views.py` 的 `chat` 函数，在返回前：

```python
from .tasks import notify_after_chat

# ... 组装 content, usage ...

# 异步发送通知（不阻塞响应）
notify_after_chat.delay(req['conversation_id'], req['message'])

return Response(resp_serializer.data)
```

### D8-5：启动 Worker

```bash
# 终端 1：Django runserver
python manage.py runserver

# 终端 2：Celery Worker
celery -A config worker -l info

# 终端 3：确认 RabbitMQ 正在运行
rabbitmqctl status
```

### 验收
1. 发一条聊天消息
2. Celery Worker 终端应打印 `[Celery] conversation=...`
3. `redis-cli GET chat:counter:xxx` 应能看到计数

### 解释题
1. `.delay()` 和直接调用 `notify_after_chat(...)` 的区别？
2. `bind=True` + `self.retry()` 做了什么？（对比 pika 的手动重试）
3. Celery Broker（RabbitMQ）和 Result Backend（RPC）分别存什么？
4. 为什么 youlin 项目没有用 RabbitMQ 做 Broker，而是用了 Redis？

---

## D9｜LangGraph 图集成（相当于原 P6-P8，1 小时）

### 目标
在 Django 中集成 LangGraph，实现 `graph_memory` 模式。

### D9-1：迁移 graph.py

把 `backend/app/graph.py` 复制到 `apps/chat/graph.py`。

需要改的地方：

```python
# 原来：
from .deepseek_client import ...
# 改为：
from apps.chat.deepseek_client import ...

# 或者继续用 settings：
from django.conf import settings
model = ChatDeepSeek(
    model=settings.DEEPSEEK_MODEL,
    api_key=settings.DEEPSEEK_API_KEY,
)
```

### D9-2：在 Django 启动时初始化图

在 `apps/chat/apps.py`（Django AppConfig）：

```python
from django.apps import AppConfig

class ChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.chat'

    def ready(self):
        # Django 启动时导入图，触发 Checkpointer 初始化
        from . import graph  # noqa: F401
```

### D9-3：graph_memory 视图

在 `apps/chat/views.py` 中：

```python
from langchain_core.messages import HumanMessage
from .graph import graph as lang_graph
from .models import Session  # 用于懒创建

@api_view(['POST'])
def chat(request):
    req_serializer = ChatRequestSerializer(data=request.data)
    req_serializer.is_valid(raise_exception=True)
    req = req_serializer.validated_data

    # ── graph_memory 分支 ──
    if req['context_mode'] == 'graph_memory':
        # 懒创建会话
        Session.objects.get_or_create(
            id=req['conversation_id'],
            defaults={'title': req.get('title') or '未命名会话'},
        )
        # 只传当前消息（历史在 Checkpointer 里）
        result = lang_graph.invoke(
            {'messages': [HumanMessage(content=req['message'])]},
            config={'configurable': {'thread_id': req['conversation_id']}},
        )
        content = result['messages'][-1].content
        return Response({
            'conversation_id': req['conversation_id'],
            'message': {'role': 'assistant', 'content': content},
            'usage': None,
        })

    # ── client_history 分支（同 D4） ──
    # ...
```

### D9-4：消息查询视图

```python
@api_view(['GET'])
def get_conversation_messages(request, conversation_id):
    snapshot = lang_graph.get_state(
        {'configurable': {'thread_id': conversation_id}}
    )
    messages = snapshot.values.get('messages', []) if snapshot and snapshot.values else []
    return Response([
        {
            'role': 'user' if m.type == 'human' else 'assistant',
            'content': m.content,
        }
        for m in messages
        if m.type in ('human', 'ai')
    ])
```

### 验收
1. 前端切到 `graph_memory` 模式
2. 连续问两轮，第二轮能接上
3. 两个不同 conversation_id 互不干扰
4. 重启 Django 后历史不丢失（MySQL Checkpointer）

---

## D10｜收尾：管理命令 + 管理后台 + 测试（可选，1 小时）

### D10-1：自定义管理命令

仿照 `python manage.py runserver`，创建自己的命令。

```bash
mkdir -p apps/chat/management/commands
```

`apps/chat/management/commands/seed_data.py`：

```python
from django.core.management.base import BaseCommand
from apps.chat.models import Session

class Command(BaseCommand):
    help = '创建测试会话数据'

    def handle(self, *args, **options):
        Session.objects.get_or_create(id='demo-1', title='测试会话')
        self.stdout.write(self.style.SUCCESS('Done'))
```

### D10-2：注册 Django Admin

在 `apps/chat/admin.py`：

```python
from django.contrib import admin
from .models import Session

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'created_at', 'updated_at')
    search_fields = ('id', 'title')
```

### D10-3：运行测试

```bash
python manage.py test apps.chat
```

---

## 总对照表：FastAPI → Django

| 概念 | FastAPI | Django |
|---|---|---|
| 创建项目 | 手动建目录 + `main.py` | `django-admin startproject` |
| 创建模块 | 手动建文件 | `python manage.py startapp` |
| 路由 | 装饰器 `@app.get(...)` | `urls.py` + `path()` |
| 请求校验 | Pydantic 类型注解 | DRF Serializer + `is_valid()` |
| ORM | 裸 SQL / SQLAlchemy | Django ORM + migrations |
| 数据库迁移 | 手动执行 .sql | `makemigrations` + `migrate` |
| 缓存 | `redis-py` 手动调用 | Django Cache 框架 |
| 消息队列 | `pika` 手动 publish/consume | Celery + `@shared_task` |
| 配置管理 | `.env` + `os.getenv` | `settings.py` + `python-decouple` |
| 开发服务器 | `uvicorn --reload` | `python manage.py runserver` |
| 管理后台 | 无（手动 Swagger） | Django Admin |
| 测试 | pytest | `python manage.py test` |

---

## 每日进度建议

| 天 | 练习 | 累计时间 |
|---|---|---|
| Day 1 | D0-D2（环境 + settings + Serializer） | ~2h |
| Day 2 | D3-D5（DeepSeek + chat 路由 + CORS） | ~2h |
| Day 3 | D6（Django ORM + MySQL） | ~1.5h |
| Day 4 | D7（Redis 缓存） | ~1h |
| Day 5 | D8（Celery + RabbitMQ） | ~1.5h |
| Day 6 | D9（LangGraph 集成） | ~1h |
| Day 7 | D10（收尾 + 前端联调） | ~1h |

---

## 口试题（完成全部后回答）

1. Django 的 `settings.py`、`urls.py`、`views.py`、`models.py` 各自职责是什么？
2. DRF Serializer 和 Pydantic BaseModel 各有什么优劣？什么时候该用哪个？
3. Celery Task 在 RabbitMQ 中的完整生命周期是怎样的？（publish → queue → consume → ack → result）
4. Django ORM 的 `get_or_create` 是怎么转换成 SQL 的？为什么比手写 `INSERT IGNORE` 更安全？
5. 这个项目中，LangGraph Checkpointer 用 MySQL 存对话状态，Celery 用 RabbitMQ 发消息，Redis 做缓存——三种"存储"各解决了什么问题？能不能合并成一种？
