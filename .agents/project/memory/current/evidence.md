# Evidence

- validation: `node --check frontend/app.js`
- result: 通过；JavaScript 无语法错误。
- validation: HTMLParser 读取 `frontend/index.html`
- result: 通过；HTML 可解析且标题存在。
- validation: Playwright 桌面浏览器执行发送、多轮追问、新建窗口、窗口切换、刷新持久化、Day 1/Day 2 策略切换。
- result: 通过；第一窗口 4 条历史可回忆，第二窗口初始历史为 0，刷新后仍保留；console 0 error / 0 warning。
- validation: Playwright 390x844 响应式 smoke 与 1440x900 桌面视觉检查。
- result: 通过；核心表单、消息、窗口与上下文控件可见可操作。
- validation: `node .agents/scripts/agent-harness-verify.mjs --agents-dir .agents`
- result: 首次检查仅因 Evaluator 报告尚未创建而失败；创建报告后需复跑。
- risk: 真实 `GET /health`、`POST /api/chat`、DeepSeek 与 LangGraph 未验证，因为 Python 后端按用户要求由学习者手写。
- artifact: `output/playwright/agent-lab-demo.png`
- artifact: `output/playwright/agent-lab-mobile.png`
