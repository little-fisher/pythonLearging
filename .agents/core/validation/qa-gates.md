# QA Gate 验收约束

QA Gate 用于把“页面看起来差不多”“接口应该没问题”这类口头验收，转成 Harness Run 可检查的证据闸口。

第一性原则：

- 不为 `micro` 任务增加流程。
- `normal` 任务按验证矩阵做窄验证，QA Gate 默认建议，不强制。
- `complex` / `long` 任务只在命中 UI、Figma、浏览器运行时、接口契约等风险时启用强约束。
- Harness Core 只强制“必须有证据才能 pass”，不绑定具体浏览器或 MCP 实现。

## Gate 类型

| Gate | 适用场景 | 必需证据 |
|---|---|---|
| `runtime-console` | 页面、交互、复杂前端任务 | 浏览器 console error 结果，阻塞错误必须列出。 |
| `runtime-network` | 页面依赖接口、后端联调、数据加载 | network 请求状态码、关键接口 URL、失败请求、必要响应摘要。 |
| `visual-compare` | 页面绘制、设计规范、Figma 截图还原 | 目标截图、实际截图、差异说明、可接受偏差。 |
| `api-contract` | 后端接口、前端请求、TS 类型或 OpenAPI 契约 | 请求/响应字段与 TS、OpenAPI、后端定义的对应关系。 |
| `accessibility-smoke` | 可交互页面、表单、弹窗 | 键盘焦点、按钮可点击、关键文本可读的 smoke 结果。 |

## Playwright MCP 建议流程

使用 Playwright MCP 或 Playwright 脚本时，优先收集窄证据：

1. 打开目标真实页面和目标 viewport。
2. 等待关键 root、标题、按钮或业务数据出现。
3. 监听 console，记录 error/warning 中与本任务相关的阻塞项。
4. 监听 network，记录失败请求、非 2xx/3xx 状态码、关键接口响应摘要。
5. 对页面绘制类任务截图，并与设计规范、Figma 链接截图或参考图反复比对。
6. 交互任务必须执行真实点击、输入、切换、关闭或提交路径。
7. 把截图路径、trace 路径、接口状态码和差异结论写入 evidence。

## Figma / 设计验收

当用户给出 Figma 链接、设计规范或参考截图时：

- `complex` 页面绘制任务 MUST 有 `visual-compare` gate。
- Evidence MUST 写清设计来源：Figma URL、截图文件、设计规范文件或用户给出的参考图。
- Evidence MUST 写清实际页面截图路径。
- 如果无法访问 Figma 或截图，MUST 用 `cannot-verify` 或 `blocked` 记录原因，不能直接 pass。

## 接口验收

当任务涉及后端接口、前端请求、数据加载或 TS/API 契约时：

- `complex` / `long` 任务 MUST 有 `runtime-network` 或 `api-contract` gate。
- Evidence SHOULD 包含关键接口 URL、状态码、请求方法、响应字段摘要。
- 如果存在 TS 类型、OpenAPI、Swagger、Zod、Prisma、proto 或后端 DTO，Evidence SHOULD 对照字段。
- 发现 4xx/5xx、CORS、解析错误、字段缺失、类型不一致时，Evaluator MUST NOT 给 pass。

## 状态机约束

`harness-run.mjs` 会把命中的 QA Gate 写入 `run.json.quality_gates`。

当 run 的 Evaluator 决策是 `pass` 时：

- 所有 `required: true` 的 QA Gate MUST 有 evidence。
- 所有 required gate 的 `status` MUST 是 `passed`。
- 失败、阻塞或未验证 gate 可以让 run 进入 `fail` 或 `blocked`，但不能 pass。

CLI 示例：

```bash
node .agents/scripts/harness-run.mjs scope \
  --run-id <id> \
  --success "页面与 Figma 主视觉一致" \
  --validation "Playwright MCP 截图比对" \
  --qa-gate visual-compare \
  --qa-gate runtime-console

node .agents/scripts/harness-run.mjs evidence \
  --run-id <id> \
  --gate QG-visual-compare \
  --validation "Playwright MCP 对比 Figma 截图" \
  --result "实际截图 screenshots/home.png，与参考图主要布局一致" \
  --artifact "screenshots/home.png"
```

