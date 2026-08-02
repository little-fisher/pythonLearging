# 本地化部署实操计划（对应《大模型调用与本地化部署教案》本地部署线）

> 定位：PPT 第 11–14 页（AutoDL / ModelScope / vLLM / 量化）的实战落地。
> 前置：已完成当前项目的 4 天计划（P0–P8、D3 工具、D4 MySQL）。
> 目标：把"云 API 版聊天应用"切成"本地/租卡推理版"，且**复用现有前端和 LangGraph 记忆层**。
> 核心心法（呼应 PPT 第 3 页四层）：本地部署不是换模型，而是换"推理服务层"——应用层、接口层基本不动。

## 链路总览

```text
应用层      frontend (5173)  ->  FastAPI (8000)  ->  LangGraph(记忆)
接口层      OpenAI-compatible HTTP API   ← vLLM 提供
推理服务层  vLLM（AutoDL 的 GPU 上）
模型层      DeepSeek-R1-Distill-Qwen-14B（ModelScope 下载的权重）
```

改动最小化原则：**只改 `base_url` 和 `model` 两个配置**，其余不动。

---

## 第 0 阶段（可选 · 本地免费预热，1–2 h）

先用小模型把"链路感"跑通，再花钱上大卡。

- 装 Ollama：`curl -fsSL https://ollama.com/install.sh | sh`
- 拉一个小模型练手：`ollama pull qwen2.5:7b`（或 3b）
- 启动并暴露 OpenAI 兼容接口：`ollama serve`（默认 `http://127.0.0.1:11434/v1`）
- 用你的 Python 客户端发一条消息，观察返回结构

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:11434/v1", api_key="ollama")
r = client.chat.completions.create(model="qwen2.5:7b", messages=[{"role":"user","content":"你好"}])
print(r.choices[0].message.content)
```

通过条件：本地能打印出模型回答，且你已亲眼看到"下载权重 → 起推理 → 暴露接口 → 接入"四步。

## 第 1 阶段：AutoDL 租机（30–60 min，含排队）

### 硬件选型（14B 显存估算，跑前先算清楚）

| 精度 | 权重体积 | 建议显存 | 推荐卡 |
|---|---|---|---|
| 全精度 BF16 | ~28 GB | ≥ 40 GB | A100-40G / 80G |
| AWQ / GPTQ 4bit | ~9–10 GB | 24 GB 够 | RTX 4090（性价比首选） |

- 首次建议：**4090 + AWQ 量化版**，够用且便宜。
- 计费按开机时长；AutoDL 有"关机实例保留 15 天"的机制，不用时**关机**。

### 步骤

1. AutoDL 注册 → 充值（几十块够跑几次）→ 控制台"租用新实例"。
2. 选：地区（可不管）、GPU 4090、镜像选带 **PyTorch 2.x** 的基础镜像。
3. 开机后从控制台进入 **JupyterLab** 或 SSH 终端。
4. 基础检查（PPT 第 4 页四个命令里的 GPU 版）：
   ```bash
   nvidia-smi
   python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
   ```
   必须都是 `True` / 看到显卡名。

通过条件：`nvidia-smi` 能看到显卡、显存；torch 能认到 CUDA。

## 第 2 阶段：下载模型（ModelScope，30–60 min）

- 装下载器：`pip install modelscope`
- 看模型页：`deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`（PPT 第 12 页：模型页 = 部署说明书，先看权重/Tokenizer/说明）
- 全精度版：
  ```bash
  modelscope download --model deepseek-ai/DeepSeek-R1-Distill-Qwen-14B \
    --local_dir /root/DeepSeek-R1-Distill-Qwen-14B
  ```
- 4090 建议直接下 **AWQ 量化版**（ModelScope 上搜 `DeepSeek-R1-Distill-Qwen-14B AWQ`，社区或官方仓库里选一个标明的量化版）：
  ```bash
  modelscope download --model <某厂商>/DeepSeek-R1-Distill-Qwen-14B-AWQ \
    --local_dir /root/DeepSeek-R1-Distill-Qwen-14B-AWQ
  ```

通过条件：模型目录里能看到 `config.json`、权重文件、tokenizer 文件；`du -sh` 大小符合预期（全精度约 28G，AWQ 约 10G）。

## 第 3 阶段：vLLM 起 OpenAI 兼容服务（30–45 min）

- 装 vLLM：`pip install vllm`（镜像自带则跳过）
- 全精度：
  ```bash
  python -m vllm.entrypoints.openai.api_server \
    --model /root/DeepSeek-R1-Distill-Qwen-14B \
    --port 8000 --host 0.0.0.0 \
    --gpu-memory-utilization 0.9
  ```
- AWQ 量化版（多了 `--quantization awq`）：
  ```bash
  python -m vllm.entrypoints.openai.api_server \
    --model /root/DeepSeek-R1-Distill-Qwen-14B-AWQ \
    --quantization awq --port 8000 --host 0.0.0.0 \
    --gpu-memory-utilization 0.9
  ```
- 观察启动日志：看到模型加载完成、端口监听即成功；第一次加载权重较慢是正常的。

通过条件：日志无报错、端口起来；`/v1/models` 能列出模型（见下一步）。

## 第 4 阶段：测试接口（20–30 min）

在本机（你的 Mac）用 curl 打 AutoDL 的接口。AutoDL 控制台提供**自定义服务 / SSH 隧道**把 8000 端口映射到公网地址，按控制台提示拿到 `http://<你的域名>/v1`。

```bash
curl http://<你的域名>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"/root/DeepSeek-R1-Distill-Qwen-14B-AWQ","messages":[{"role":"user","content":"你好，介绍一下你自己"}]}'
```

通过条件：返回 JSON 里有 `choices[0].message.content` 且是像样的回答。这一步通过 = 你已经有了一台"自建的 OpenAI 兼容模型服务"。

## 第 5 阶段：接入现有应用（30–60 min，核心收获）

思路：**给项目加"本地模式"，只改 base_url + model**。

1. 在 `backend/.env` 追加（照 PPT 第 8 页的 LOCAL_* 命名）：
   ```ini
   LOCAL_BASE_URL=<AutoDL 的 /v1 地址>
   LOCAL_MODEL=/root/DeepSeek-R1-Distill-Qwen-14B-AWQ
   ```
2. 在 `deepseek_client.py` 里支持按环境变量选"云端 / 本地"：
   ```python
   BASE_URL = os.getenv("LOCAL_BASE_URL") or "https://api.deepseek.com"
   MODEL = os.getenv("LOCAL_MODEL") or os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
   ```
   有 `LOCAL_BASE_URL` 就走本地 vLLM，没有就走云端——**同一套调用代码**。
3. 记忆层复用：现有 `client_history` / `graph_memory`（LangGraph）**完全不用改**，因为本地 vLLM 提供的就是 OpenAI 兼容 chat 接口，LangGraph 的 `ChatDeepSeek` 换成指向本地地址的兼容客户端即可。

通过条件：前端页面（不用改代码）在"本地模式"下能多轮对话；第二问能接上第一轮上下文；LangGraph 的 thread_id 记忆依然生效。

## 最终验收清单

- [ ] 能从 ModelScope 下载 14B 权重（或量化版）
- [ ] vLLM 在 AutoDL 上跑起 OpenAI 兼容接口
- [ ] 本机 curl 能拿到真实模型回答
- [ ] 现有前端 + FastAPI 只改配置就切到本地模型，且多轮/记忆正常
- [ ] 能画出并解释完整链路：Browser → FastAPI → LangGraph → vLLM → 14B 权重
- [ ] 能用一句话说清"换服务商 vs 换模型 vs 换推理框架"各改哪一层（对应 PPT 口试）

## 常见坑

1. **显存不够**：加载时 OOM → 换 AWQ 量化版，或调小 `--gpu-memory-utilization`、`--max-model-len`。
2. **下载慢/失败**：ModelScope 比 HuggingFace 在国内更快；失败就重试，或换 `--local_dir` 再下。
3. **端口不通**：AutoDL 的 8000 不是公网开放端口，必须走控制台的"自定义服务/SSH 隧道"映射。
4. **忘记关机**：实例开机即计费，练完**关机**（数据保留 15 天）；长期不用会释放。
5. **推理模型输出格式**：R1-Distill 是推理模型，答案可能带思考过程；聊天页面拿 `content` 即可，别把整段 JSON 直接渲染。

## 预算参考（以 4090 为例，按量计费）

- 下载 + 启动 + 联调：约 1～2 小时，大概十几到几十元。
- 建议一次开机把 2、3、4、5 阶段连着做完，减少开关机次数。
