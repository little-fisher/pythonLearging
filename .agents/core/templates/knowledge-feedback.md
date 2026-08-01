# Knowledge Feedback

- task_type:
- knowledge_used: yes/no
- useful_sources:
- missing_sources:
- decisions:
- validation:
- reusable_asset:
- suggested_destination:
- confidence: high/medium/low
- sensitive: yes/no

## 填写规则

- `useful_sources` 只写本次真实有帮助的知识入口。
- `missing_sources` 写"如果有会更快"的缺口，不要为了完整硬写。
- `decisions` 写可复用判断，不写一次性聊天记录。
- `validation` 必须有证据：命令、人工确认、输出物或失败日志。
- `confidence: low` 时仍可进入机器 Wiki，但证据状态只能从 `observed` 开始。
- `sensitive: yes` 的原文只留项目 Raw；只有通过全字段脱敏和最终敏感扫描的投影才能进入机器 Wiki。
