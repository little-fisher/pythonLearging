# 项目章程

## 项目定位

- 本工作区用于通过可运行的小项目学习 Python 大模型智能体开发。
- 目标技术栈为 FastAPI + LangGraph；学习方式是每 30 分钟完成一个可验证的纵向闭环。
- 前端可由 Agent 辅助生成，Python 后端核心实现由学习者亲手编写并能口头解释。
- 以项目现有 `README`、需求、代码和 `.agents/project/project-profile.md` 为事实源。

## 当前边界

- 项目业务规则写入 `.agents/project/`，不修改通用 `.agents/core/`。
- 初始化和版本同步不得覆盖项目已有规则或业务文件。
- 客户敏感信息只保留在授权位置，跨项目回流前必须脱敏。
- 不把 API Key 写入前端、仓库或示例响应；统一通过后端环境变量读取。
- 学习阶段先完成聊天请求链、会话隔离和多轮上下文，不提前扩展 RAG、数据库和复杂工具调用。

## 验证入口

- 前端启动：`python3 -m http.server 5173 --directory frontend`。
- 前端验收：真实浏览器执行发送、创建/切换会话、多轮追问、刷新持久化检查。
- 后端验收：用户完成后以 FastAPI `/docs`、`curl` 和浏览器联调为准。
- Harness 自检：`node .agents/scripts/agent-harness-verify.mjs --agents-dir .agents`
