"use strict";

const STORAGE_KEY = "agent-lab:workspace:v1";
const DEFAULT_ENDPOINT = "http://localhost:8000";
const MAX_TITLE_LENGTH = 18;

const elements = {
  conversationList: document.querySelector("#conversationList"),
  newSessionButton: document.querySelector("#newSessionButton"),
  sessionTotal: document.querySelector("#sessionTotal"),
  chatTitle: document.querySelector("#chatTitle"),
  threadId: document.querySelector("#threadId"),
  messageList: document.querySelector("#messageList"),
  promptSuggestions: document.querySelector("#promptSuggestions"),
  composerForm: document.querySelector("#composerForm"),
  messageInput: document.querySelector("#messageInput"),
  characterCount: document.querySelector("#characterCount"),
  sendButton: document.querySelector("#sendButton"),
  connectionMode: document.querySelector("#connectionMode"),
  contextMode: document.querySelector("#contextMode"),
  apiEndpoint: document.querySelector("#apiEndpoint"),
  testConnectionButton: document.querySelector("#testConnectionButton"),
  contextMessageCount: document.querySelector("#contextMessageCount"),
  contextCharacterCount: document.querySelector("#contextCharacterCount"),
  payloadPreview: document.querySelector("#payloadPreview"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  statusDot: document.querySelector("#statusDot"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  toast: document.querySelector("#toast"),
};

const state = loadWorkspace();
let toastTimer = 0;

bindEvents();
renderAll();
syncSessionsFromApi();   // D4-3 ②：API 模式下启动时从后端拉会话列表

function bindEvents() {
  elements.newSessionButton.addEventListener("click", () => createAndActivateSession());
  elements.composerForm.addEventListener("submit", handleSubmit);
  elements.messageInput.addEventListener("input", () => {
    resizeComposer();
    updateCharacterCount();
    renderInspector();
  });
  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      elements.composerForm.requestSubmit();
    }
  });

  elements.promptSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (!button) return;
    elements.messageInput.value = button.dataset.prompt || "";
    resizeComposer();
    updateCharacterCount();
    renderInspector();
    elements.messageInput.focus();
  });

  elements.connectionMode.addEventListener("change", () => {
    state.settings.connectionMode = elements.connectionMode.value;
    setConnectionState(
      state.settings.connectionMode === "demo" ? "ready" : "idle",
      state.settings.connectionMode === "demo" ? "本地演示已就绪" : "等待测试 FastAPI",
    );
    persistWorkspace();
    renderSettings();
    if (state.settings.connectionMode === "api") syncSessionsFromApi();   // D4-3 ②：切到 API 模式就拉一次
  });

  elements.contextMode.addEventListener("change", () => {
    state.settings.contextMode = elements.contextMode.value;
    persistWorkspace();
    renderInspector();
    showToast(
      state.settings.contextMode === "client_history"
        ? "Day 1：后端应显式拼接浏览器历史"
        : "Day 2：后端应只追加当前消息，由 thread_id 找回状态",
    );
  });

  elements.apiEndpoint.addEventListener("change", () => {
    state.settings.apiEndpoint = normalizeEndpoint(elements.apiEndpoint.value);
    elements.apiEndpoint.value = state.settings.apiEndpoint;
    persistWorkspace();
    renderInspector();
  });

  elements.testConnectionButton.addEventListener("click", testConnection);
  elements.copyPayloadButton.addEventListener("click", copyPayload);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (!isTyping && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createAndActivateSession();
    }
  });
}

function loadWorkspace() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && Array.isArray(stored.sessions) && stored.sessions.length > 0) {
      const activeExists = stored.sessions.some((session) => session.id === stored.activeSessionId);
      return {
        sessions: stored.sessions.map(sanitizeSession),
        activeSessionId: activeExists ? stored.activeSessionId : stored.sessions[0].id,
        settings: {
          connectionMode: stored.settings?.connectionMode === "api" ? "api" : "demo",
          contextMode:
            stored.settings?.contextMode === "graph_memory" ? "graph_memory" : "client_history",
          apiEndpoint: normalizeEndpoint(stored.settings?.apiEndpoint || DEFAULT_ENDPOINT),
        },
        pendingSessionId: null,
      };
    }
  } catch (error) {
    console.warn("无法读取本地实验记录，将创建新会话。", error);
  }

  const firstSession = createSession();
  return {
    sessions: [firstSession],
    activeSessionId: firstSession.id,
    settings: {
      connectionMode: "demo",
      contextMode: "client_history",
      apiEndpoint: DEFAULT_ENDPOINT,
    },
    pendingSessionId: null,
  };
}

function sanitizeSession(session) {
  const fallback = createSession();
  if (!session || typeof session !== "object") return fallback;

  return {
    id: typeof session.id === "string" ? session.id : fallback.id,
    title: typeof session.title === "string" ? session.title : "未命名会话",
    createdAt: typeof session.createdAt === "string" ? session.createdAt : fallback.createdAt,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : fallback.updatedAt,
    messages: Array.isArray(session.messages)
      ? session.messages
          .filter((message) => message && ["user", "assistant"].includes(message.role))
          .map((message) => ({
            id: typeof message.id === "string" ? message.id : createId("msg"),
            role: message.role,
            content: String(message.content || ""),
            createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
            local: Boolean(message.local),
          }))
      : fallback.messages,
  };
}

function createSession() {
  const timestamp = new Date().toISOString();
  return {
    id: createId("conv"),
    title: "未命名会话",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      {
        id: createId("msg"),
        role: "assistant",
        content:
          "实验台已就绪。先告诉我一条需要记住的信息，再用第二个问题验证上下文。\n\n当前是本地演示模式；你写完 FastAPI 后，可以在右侧切换为真实联调。",
        createdAt: timestamp,
        local: true,
      },
    ],
  };
}

function createAndActivateSession() {
  const session = createSession();
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  persistWorkspace();
  renderAll();
  elements.messageInput.focus();
  showToast("已创建独立会话，新窗口不会继承旧窗口历史");
}

function deleteSession(sessionId) {
  if (state.pendingSessionId === sessionId) {
    showToast("这个会话正在等待回复，暂时不能删除", true);
    return;
  }

  // D4-3 ②：API 模式下，同步删掉后端那条会话（失败也别阻断本地操作）
  if (state.settings.connectionMode === "api") {
    fetch(`${normalizeEndpoint(state.settings.apiEndpoint)}/conversations/${sessionId}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  if (state.sessions.length === 0) state.sessions.push(createSession());
  if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0].id;
  }
  persistWorkspace();
  renderAll();
}

function persistWorkspace() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        settings: state.settings,
      }),
    );
  } catch (error) {
    console.error("保存本地实验记录失败。", error);
    showToast("本地存储失败，刷新后记录可能丢失", true);
  }
}

function renderAll() {
  renderConversations();
  renderChat();
  renderSettings();
  renderInspector();
  updateCharacterCount();
  resizeComposer();
}

function renderConversations() {
  elements.conversationList.replaceChildren();
  elements.sessionTotal.textContent = String(state.sessions.length).padStart(2, "0");

  state.sessions.forEach((session, index) => {
    const item = document.createElement("div");
    item.className = `conversation-item${session.id === state.activeSessionId ? " is-active" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.className = "conversation-select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-label", `打开会话：${session.title}`);
    selectButton.addEventListener("click", () => {
      state.activeSessionId = session.id;
      persistWorkspace();
      renderAll();
    });

    const number = document.createElement("span");
    number.className = "conversation-index";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "conversation-copy";
    const title = document.createElement("strong");
    title.textContent = session.title;
    const meta = document.createElement("small");
    const count = getContextMessages(session).length;
    meta.textContent = `${count} MSG · ${formatListTime(session.updatedAt)}`;
    copy.append(title, meta);
    selectButton.append(number, copy);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-session";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `删除会话：${session.title}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteSession(session.id));

    item.append(selectButton, deleteButton);
    elements.conversationList.append(item);
  });
}

function renderChat() {
  const session = getActiveSession();
  if (!session) return;

  elements.chatTitle.textContent = session.title;
  elements.threadId.textContent = session.id;
  elements.threadId.title = session.id;
  elements.messageList.replaceChildren();

  session.messages.forEach((message) => {
    elements.messageList.append(createMessageElement(message));
  });

  if (state.pendingSessionId === session.id) {
    elements.messageList.append(createTypingElement());
  }

  elements.sendButton.disabled = Boolean(state.pendingSessionId);
  const sendLabel = elements.sendButton.querySelector("span");
  if (sendLabel) sendLabel.textContent = state.pendingSessionId ? "等待" : "发送";

  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message is-${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = message.role === "user" ? "U" : "AI";

  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("div");
  label.className = "message-label";
  const role = document.createElement("span");
  role.textContent = message.role === "user" ? "YOU" : "ASSISTANT";
  const time = document.createElement("time");
  time.dateTime = message.createdAt;
  time.textContent = formatMessageTime(message.createdAt);
  label.append(role, time);

  if (message.local) {
    const localTag = document.createElement("span");
    localTag.className = "local-tag";
    localTag.textContent = "LOCAL";
    label.append(localTag);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = message.content;
  body.append(label, bubble);
  article.append(avatar, body);
  return article;
}

function createTypingElement() {
  const message = document.createElement("article");
  message.className = "message is-assistant";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "AI";
  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = state.settings.connectionMode === "demo" ? "LOCAL SIMULATION" : "WAITING FOR API";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble typing-bubble";
  bubble.setAttribute("aria-label", "正在生成回复");
  bubble.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  body.append(label, bubble);
  message.append(avatar, body);
  return message;
}

function renderSettings() {
  const isApi = state.settings.connectionMode === "api";
  elements.connectionMode.value = state.settings.connectionMode;
  elements.contextMode.value = state.settings.contextMode;
  elements.apiEndpoint.value = state.settings.apiEndpoint;
  elements.apiEndpoint.disabled = !isApi;
  elements.testConnectionButton.disabled = !isApi;

  if (!isApi) setConnectionState("ready", "本地演示已就绪");
}

function renderInspector() {
  const session = getActiveSession();
  if (!session) return;
  const history = getContextMessages(session);
  const draft = elements.messageInput.value.trim() || "<等待输入>";
  const payload = createPayload(session.id, draft, history);
  const characterTotal = history.reduce((sum, message) => sum + message.content.length, 0);

  elements.contextMessageCount.textContent = String(history.length);
  elements.contextCharacterCount.textContent = String(characterTotal);
  elements.payloadPreview.textContent = JSON.stringify(payload, null, 2);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.pendingSessionId) return;

  const content = elements.messageInput.value.trim();
  if (!content) {
    showToast("先输入一条消息", true);
    elements.messageInput.focus();
    return;
  }

  const session = getActiveSession();
  if (!session) return;
  const historyBeforeCurrent = getContextMessages(session);
  const payload = createPayload(session.id, content, historyBeforeCurrent);

  session.messages.push(createMessage("user", content));
  session.updatedAt = new Date().toISOString();
  if (session.title === "未命名会话") session.title = createTitle(content);

  state.pendingSessionId = session.id;
  elements.messageInput.value = "";
  persistWorkspace();
  renderAll();

  try {
    const reply =
      state.settings.connectionMode === "demo"
        ? await getDemoReply(content, historyBeforeCurrent)
        : await requestAssistant(payload);
    const targetSession = state.sessions.find((item) => item.id === session.id);
    if (!targetSession) return;
    targetSession.messages.push(createMessage("assistant", reply));
    targetSession.updatedAt = new Date().toISOString();
    setConnectionState(
      "ready",
      state.settings.connectionMode === "demo" ? "本地演示已就绪" : "FastAPI 最近请求成功",
    );
    // D4-3 ②：API 回复成功后刷新列表（让刚落库的新会话出现在后端名单里）
    if (state.settings.connectionMode === "api") syncSessionsFromApi();
  } catch (error) {
    const targetSession = state.sessions.find((item) => item.id === session.id);
    if (targetSession) {
      targetSession.messages.push(
        createMessage(
          "assistant",
          `这次请求没有完成：${error.message}\n\n用户消息已保留。检查 FastAPI 终端、浏览器 Network 和接口契约后可以继续重试。`,
          true,
        ),
      );
      targetSession.updatedAt = new Date().toISOString();
    }
    setConnectionState("error", "FastAPI 请求失败");
    showToast(error.message, true);
  } finally {
    state.pendingSessionId = null;
    persistWorkspace();
    renderAll();
    elements.messageInput.focus();
  }
}

function createPayload(conversationId, message, history) {
  // D4-3 ②：把会话标题带给后端（新会话用第一条消息生成标题）
  const session = getActiveSession();
  const title =
    session && session.title !== "未命名会话" ? session.title : createTitle(message);
  return {
    conversation_id: conversationId,
    message,
    history,
    context_mode: state.settings.contextMode,
    title,
  };
}

async function requestAssistant(payload) {
  const response = await fetch(`${normalizeEndpoint(state.settings.apiEndpoint)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`POST /api/chat 返回 ${response.status}${detail ? `：${detail}` : ""}`);
  }

  const data = await response.json();
  if (data?.message?.role !== "assistant" || typeof data.message.content !== "string") {
    throw new Error("后端响应不符合 API_CONTRACT.md：缺少 assistant message.content");
  }
  return data.message.content;
}

// D4-3 ②：从后端 GET /conversations 拉会话列表，合并进本地 state.sessions
async function syncSessionsFromApi() {
  if (state.settings.connectionMode !== "api") return;   // 只有 API 模式才需要后端数据
  try {
    const res = await fetch(`${normalizeEndpoint(state.settings.apiEndpoint)}/conversations`);
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;

    const backendById = new Map(list.map((c) => [c.id, c]));
    const localById = new Map(state.sessions.map((s) => [s.id, s]));
    const merged = [];

    // ① 后端有 → 合并进本地（更新标题/时间；本地没有的就从后端建一个会话壳）
    for (const [id, backend] of backendById) {
      const local = localById.get(id);
      if (local) {
        local.title = backend.title || local.title;
        local.updatedAt = backend.updated_at;
        local.createdAt = backend.created_at;
        merged.push(local);
      } else {
        merged.push({
          id,
          title: backend.title || "未命名会话",
          createdAt: backend.created_at,
          updatedAt: backend.updated_at,
          messages: [],   // 消息仍由后端 Checkpointer 管，前端列表只显示名片
        });
      }
    }
    // ② 本地有、后端还没有的（还没发过消息）→ 保留（之后第一次发消息才会落库）
    for (const s of state.sessions) {
      if (!backendById.has(s.id)) merged.push(s);
    }

    state.sessions = merged;
    persistWorkspace();
    renderAll();
  } catch {
    // 后端不可达 → 静默保留本地数据，不打扰用户
  }
}

async function testConnection() {
  if (state.settings.connectionMode !== "api") return;
  elements.testConnectionButton.disabled = true;
  elements.testConnectionButton.textContent = "检查中…";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${normalizeEndpoint(state.settings.apiEndpoint)}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`/health 返回 ${response.status}`);
    const data = await response.json();
    if (data?.status !== "ok") throw new Error("/health 响应缺少 status: ok");
    setConnectionState("ready", "FastAPI /health 已连接");
    showToast("连接成功：FastAPI 已可访问，下一步测试 /api/chat");
  } catch (error) {
    const message = error.name === "AbortError" ? "连接超时，请确认 Uvicorn 已启动" : error.message;
    setConnectionState("error", "FastAPI 连接失败");
    showToast(message, true);
  } finally {
    window.clearTimeout(timeout);
    elements.testConnectionButton.textContent = "测试 /health ↗";
    elements.testConnectionButton.disabled = false;
  }
}

async function getDemoReply(currentMessage, history) {
  await delay(620 + Math.min(currentMessage.length * 7, 580));
  const previousUserMessages = history.filter((message) => message.role === "user");
  const lastPreviousUserMessage = previousUserMessages.at(-1);

  if (/记住|我叫|代号是|喜欢/.test(currentMessage)) {
    return `已记录在当前窗口的上下文中：「${currentMessage}」\n\n现在继续问“我刚才说了什么？”。右侧请求预览会显示这条消息已经进入 history。`;
  }

  if (/刚才|上一轮|还记得|我叫什么|代号是什么|说了什么/.test(currentMessage)) {
    if (lastPreviousUserMessage) {
      return `我只查看了当前窗口的历史。上一条用户消息是：「${lastPreviousUserMessage.content}」\n\n这证明前端已经把同一会话的历史串起来；切到新窗口后，这段历史不会被带过去。`;
    }
    return "当前窗口没有更早的用户消息，所以我无法从上下文中找到答案。先在这个窗口写入一条信息，或者切回原来的会话再问。";
  }

  return `本地演示收到你的消息。本次请求之前共有 ${history.length} 条有效历史消息。\n\n等你完成 FastAPI 后，把右侧运行模式切到“FastAPI 联调”，同一份 JSON 会交给你的 Python 路由。`;
}

function getContextMessages(session) {
  return session.messages
    .filter((message) => !message.local)
    .map((message) => ({ role: message.role, content: message.content }));
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || state.sessions[0];
}

function createMessage(role, content, local = false) {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: new Date().toISOString(),
    local,
  };
}

function createId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function createTitle(content) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > MAX_TITLE_LENGTH ? `${compact.slice(0, MAX_TITLE_LENGTH)}…` : compact;
}

function normalizeEndpoint(value) {
  const endpoint = String(value || DEFAULT_ENDPOINT).trim();
  return endpoint.replace(/\/+$/, "") || DEFAULT_ENDPOINT;
}

function resizeComposer() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 130)}px`;
}

function updateCharacterCount() {
  elements.characterCount.textContent = `${elements.messageInput.value.length} / 4000`;
}

function setConnectionState(status, label) {
  elements.statusDot.classList.toggle("is-error", status === "error");
  elements.runtimeStatus.textContent = label;
}

function formatListTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NOW";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

async function readErrorDetail(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return "请求字段校验失败，请对照 API_CONTRACT.md";
  } catch {
    return "";
  }
  return "";
}

async function copyPayload() {
  try {
    await navigator.clipboard.writeText(elements.payloadPreview.textContent || "");
    showToast("请求 JSON 已复制");
  } catch {
    showToast("浏览器未允许复制，请手动选择 JSON", true);
  }
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

