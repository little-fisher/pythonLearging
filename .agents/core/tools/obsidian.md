# Obsidian

把 `.agents/` 作为 Obsidian 知识库使用。

## 索引规则

新增、移动、重命名或删除文档时，同步更新 `.agents/index.md`。

## Git 规则

Markdown 知识文件可以提交。个人 Obsidian UI 状态不要提交，除非团队明确需要共享 vault 设置。

本地 Obsidian 设置目录 `.agents/.obsidian/` 已在 `.gitignore` 中忽略。

## 范围规则

Obsidian 只管理 AI 工程化知识和项目执行规则。源码、运行时资源、package 配置、MCP 配置、CodeGraph 配置等工具要求位于根目录的文件，不要为了整齐移动进 vault。
