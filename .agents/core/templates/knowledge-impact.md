# Knowledge Impact

- task:
- workflow:
- knowledge_level: K0/K1/K2/K3/K4
- useful_sources:
- missing_sources:
- saved_explanation:
- avoided_rework:
- better_decision:
- reusable_output:
- next_update:

## K0-K4 标准

| 等级 | 含义 | 判断标准 |
|---|---|---|
| K0 | 未使用 | Agent 没读知识库，结果也没体现旧经验 |
| K1 | 背景参考 | 读了画像或规则，但对结果帮助有限 |
| K2 | 局部加速 | 使用了一个场景、模板或规则，减少部分解释 |
| K3 | 关键决策 | 方案选择、风险判断或实现路径明显来自知识库 |
| K4 | 直接复用 | 直接复用模板、脚本、场景专题或 skill，产出显著提速 |

## 填写规则

- 不知道就保守降级。
- 没有 `useful_sources` 通常不能高于 K1。
- 没有影响决策或返工，通常不能高于 K2。
- 直接复用模板、脚本、场景专题或 skill，才考虑 K4。
