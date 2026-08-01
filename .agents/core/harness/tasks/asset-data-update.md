# 任务：资源/数据更新

当需求涉及图片、图标、视频、静态 JSON、CSV、txt、PDF 引用或数据转换脚本时使用。

## 先读

1. `.agents/project/charter.md`
2. `.agents/project/architecture/assets-and-resources.md`
3. 涉及数据契约时读 `.agents/project/domains/static-data.md`

## 执行原则

- 先确认资源或数据属于哪个模块。
- 保持现有命名、目录和引用方式。
- 资源或数据变化时，同步更新消费方引用。
- 生成脚本和生成结果视为同一条数据链路。

## 检查清单

- 资源是否放在正确模块目录下？
- 是否已有可复用资源？
- 数据结构变化时，消费代码和生成脚本是否同步？
- 是否保留了仓库内已有命名约定？
- 是否有路径、解析或资源可访问性验证？
