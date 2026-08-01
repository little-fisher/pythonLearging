# 验证矩阵

用本文档选择验证方式。目标是证明本次需求成立，而不是把整个项目测完。

| 任务类型 | 必要验证 | 可选验证 | 人工边界 |
| --- | --- | --- | --- |
| 新增交互 | Playwright 点击路径、DOM 状态、console 检查 | 截图、network 检查 | 主观视觉细节 |
| 需求修改 | 目标运行路径、受影响 DOM 或状态检查 | CodeGraph 影响面 | 业务解释有歧义时的最终判断 |
| Bug 修复 | 复现路径或定向回归检查 | CodeGraph 影响面、聚焦 lint | 改动外的大范围回归 |
| 测试回归 | 路由和关键交互 smoke check | 截图集、网络检查 | 视觉对比细节 |
| 资源/数据更新 | Node 解析、路径检查、资源状态检查 | Playwright 渲染路径 | PDF 语义正确性 |
| 地图图层 | 数据加载、图层挂载、切换清理 | 截图、CodeGraph 清理链路 | canvas 内地理形状准确性 |
| 页面绘制/设计还原 | Playwright 截图、console 检查、设计来源记录 | Figma/参考图反复比对、trace | 主观审美取舍 |
| 接口/后端联调 | 状态码、响应字段摘要、TS/API 契约对照 | Playwright network、schema 校验 | 后端业务语义最终解释 |
| 第三方库/API/版本 | 官方文档或实时文档来源、版本和采用结论 | Context7、openai-docs、agent-reach、Firecrawl | 文档不可访问时的 fallback 风险 |
| AI 工程化更新 | 路径引用搜索、JSON/package 解析、适配入口检查 | lint 配置打印 | 未来工具具体行为 |
| 复杂/长任务 | 任务契约、分项成功标准、Evaluator 报告 | trace、截图集、回归矩阵 | 产品取舍和主观验收 |

## 验证工具

- Playwright：路由、点击、弹窗可见性、截图、console 和 network。
- Playwright MCP：真实页面操作、截图、console/network 采集、设计比对证据。
- Node 脚本：JSON、txt、路径、文件存在性和轻量 schema 检查。
- CodeGraph：结构、影响面、调用方、被调方、清理路径和依赖边界。
- 实时文档：官方文档、Context7、openai-docs、agent-reach 或 Firecrawl，用于第三方库/API/版本敏感任务。
- ESLint：低噪声运行时代码质量闸口。
- 人工确认：设计还原、地图/canvas 视觉正确性、PDF 语义内容。
- Evaluator：按任务契约逐项判断 pass/fail/blocked。
- QA Gate：对 complex/long 中的 UI、Figma、network、API 契约验收设硬闸口。

## 停止条件

遇到以下情况应停止并报告：

- 无法识别请求对应的路由或功能 owner。
- 必需源素材缺失。
- 验证发现阻塞运行时错误。
- CodeGraph 或源码检查显示目标改动会跨越冲突的业务边界。
- 版本敏感任务无法确认官方或实时文档，且没有记录 fallback 风险。
- 自动化无法验证用户关键视觉或语义条件，且没有合理 fallback。
