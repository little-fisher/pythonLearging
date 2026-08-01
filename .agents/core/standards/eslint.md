# ESLint 规范

本项目把 ESLint 作为轻量质量闸口。当前阶段不引入 typecheck。

## 使用边界

- 修改运行时代码、Vue 文件或 JS helper 时，优先运行窄范围 lint。
- 文档、图片、纯静态资源变更无需默认运行 lint。
- 如果 legacy warning 不在本次改动范围内，报告即可，不扩展成清理任务。

## 当前覆盖

- Vue 3 essential 规则
- ESLint recommended 规则
- `lang="ts"` 的 Vue SFC 解析能力
- 低噪声运行时错误检查

## 不做的事

- 不引入 TSLint。
- 不默认开启 type-aware lint。
- 不在没有统一格式化策略前新增大范围格式化规则。
- 不把已有全仓 warning 当成本次任务自动清理。

## 推荐命令

```bash
npm run lint -- --quiet
```

需要自动修复且风险可控时再运行：

```bash
npm run lint:fix
```
