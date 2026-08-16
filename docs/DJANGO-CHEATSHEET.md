# Django 速查手册（Agent Lab 重写版）

> 项目根：`backend_django/`（Django + DRF + MySQL）
> 学习路径：`docs/DJANGO-REWRITE-PLAN.md`

---

## 1. 环境 & 启动

```bash
cd /Users/aiyi/Documents/python项目/learning/backend_django
mac激活命令
source .venv/bin/activate
windows激活命令
.venv\Scripts\Activate.ps1

# 启动开发服务器
python manage.py runserver
# 访问：http://127.0.0.1:8000/api/health/

# 检查项目配置 + 数据库连接
python manage.py check
```

- 依赖安装：`pip install django djangorestframework django-cors-headers django-redis celery python-decouple pymysql cryptography openai langgraph langchain-deepseek langgraph-checkpoint-mysql redis pika`
- `.env` 放项目根（manage.py 同目录），`python-decouple` 自动读取

---

## 2. MySQL（Docker）

```bash
docker start mysql8          # 启动容器（3306 端口）
docker stop mysql8           # 停止
```

| 项 | 值 |
|---|---|
| 容器 | `mysql8`，镜像 `mysql:8` |
| 连接 | `127.0.0.1:3306` |
| 用户/密码 | `root` / `root` |
| Django 用库 | `agent_lab_chat`（独立新库，不碰原 FastAPI 的 agent_lab） |

### 关键认知
- **Django 只建表，不建库** —— 数据库要手动创建：
  ```bash
  docker exec -i mysql8 mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS agent_lab_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  ```
  或 Navicat 右键新建数据库，字符集 utf8mb4。
- 查看表：`docker exec -i mysql8 mysql -uroot -proot agent_lab_chat -e "SHOW TABLES;"`

### MySQL 常见错误码
| 错误码 | 含义 | 排查 |
|---|---|---|
| 1049 | Unknown database（库不存在） | 先手动建库 |
| 1045 | Access denied（密码错） | 查 `.env` 的 DB_USER/DB_PASSWORD |
| 2002 | 连不上主机 | `docker ps` 看容器是否启动 |

---

## 3. 模型 & 迁移（D6 核心）

```bash
# 改完 models.py 后，两步走：
python manage.py makemigrations chat   # ① 生成迁移文件（翻译成"施工计划"）
python manage.py migrate               # ② 执行迁移（真正建表/改表）
```

- 迁移文件在 `apps/chat/migrations/0001_initial.py`（带编号递增）
- 以后改字段：改模型 → makemigrations → migrate（会生成 0002、0003...）

### 分层认知
| 层 | 谁创建 | 何时 |
|---|---|---|
| 数据库（库） | **手动**（Django 不建库） | 建库一次 |
| 表 | `python manage.py migrate` | 每次模型变更 |
| 行（数据） | 应用代码 / shell | 运行时 |

---

## 4. 交互式 shell（调试常用）

```bash
python manage.py shell
```

```python
from apps.chat.models import Session

# 增
Session.objects.create(id='demo-001', title='测试会话')

# 查
Session.objects.all()
Session.objects.values('id', 'title', 'created_at', 'updated_at')  # 转 dict 列表

# 改
s = Session.objects.get(id='demo-001')
s.title = '新标题'
s.save()

# 删
Session.objects.get(id='demo-001').delete()

# 不存在会抛异常
Session.objects.get(id='xxx')  # → Session.DoesNotExist
```

---

## 5. 常用验收命令

```bash
# 健康检查
curl http://127.0.0.1:8000/api/health/

# CORS 预检（看响应头是否有 access-control-allow-origin）
curl -i -X OPTIONS http://127.0.0.1:8000/api/health/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"

# 会话列表 / 删除
curl http://127.0.0.1:8000/api/conversations/
curl -X DELETE http://127.0.0.1:8000/api/conversations/demo-001/
```

---

## 6. 本项目文件职责速记

| 文件 | 一句话职责 |
|---|---|
| `config/settings.py` | 全局配置：数据库/中间件/DRF/CORS/Celery 集中地 |
| `config/urls.py` | 根路由，`api/` 挂到 `apps.chat.urls` |
| `apps/chat/models.py` | 表结构唯一权威（Session 模型） |
| `apps/chat/serializers.py` | API 数据校验 + 序列化（进出 API 的口子） |
| `apps/chat/views.py` | 接收请求 → 处理 → 返回响应 |
| `apps/chat/urls.py` | URL ↔ 视图函数的映射表 |
| `apps/chat/deepseek_client.py` | DeepSeek 模型客户端（D3 完成） |
| `.env` | 环境变量（decouple 读取），勿提交 Git |

---

## 7. 易忘点

- URL 末尾**必须带斜杠**：`/api/health/`（Django 默认），访问 `/api/health` 会 301 重定向
- `pymysql.install_as_MySQLdb()` 必须在 settings.py 顶部、使用数据库前执行
- `INSTALLED_APPS` 里 `corsheaders`、`rest_framework`、`apps.chat` 都要注册
- `CorsMiddleware` 必须在 `MIDDLEWARE` **第一位**
- 前端跨域白名单：`CORS_ALLOWED_ORIGINS` 配 `localhost:5173` 和 `127.0.0.1:5173`（两者算不同源）
- `docker start mysql8` 后记得 `python manage.py check` 验证连接
