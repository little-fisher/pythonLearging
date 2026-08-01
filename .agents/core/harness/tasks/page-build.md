# 任务：新增页面绘制

当需求涉及新增页面、新首页模块、新大屏区块或偏布局的视觉实现时使用。

## 先读

1. `.agents/project/charter.md`
2. `.agents/project/architecture/layout-and-routing.md`
3. `.agents/project/architecture/assets-and-resources.md`
4. 相关领域文档

## 执行原则

- 从最接近的新旧页面或模块开始仿照。
- 沿用当前大屏视觉语言、间距和模块结构。
- 优先扩展现有路由和布局契约，不新造平行脚手架。
- 新资源放入匹配模块目录。

## 检查清单

- 这是新路由、新首页面板，还是现有模块内的新区块？
- 是否有相邻实现可以先镜像？
- 样式是否保持 scoped 和现有 Less 写法？
- 资源是否放在正确模块目录？
- 是否没有改动无关全局布局？
