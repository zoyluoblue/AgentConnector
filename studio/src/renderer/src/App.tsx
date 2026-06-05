import { useEffect, useMemo, useState } from "react";
import type { AgentKind, AuthState, BusyState, ChatMessage, Mode, ProjectInfo } from "../../shared/ipc";
import { AgentChip } from "./components/AgentChip";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { ProjectBar } from "./components/ProjectBar";
import { RightPanel } from "./components/RightPanel";

const DISCONNECTED: AuthState = { claude: { connected: false }, codex: { connected: false } };

const CLAUDE_MODELS = [
  { v: "", label: "默认" },
  { v: "claude-opus-4-8", label: "Opus 4.8" },
  { v: "claude-opus-4-8[1m]", label: "Opus 4.8 (1M)" },
  { v: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { v: "claude-haiku-4-5", label: "Haiku 4.5" },
  { v: "claude-opus-4-7", label: "Opus 4.7 (旧)" },
  { v: "claude-opus-4-7[1m]", label: "Opus 4.7 (1M, 旧)" },
  { v: "claude-opus-4-6", label: "Opus 4.6 (旧)" },
];
const CODEX_MODELS = [
  { v: "", label: "默认" },
  { v: "gpt-5.5", label: "GPT-5.5" },
  { v: "gpt-5.4", label: "GPT-5.4" },
  { v: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
  { v: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
];

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState<BusyState>({ claude: false, codex: false });
  const [project, setProject] = useState<ProjectInfo>({ cwd: null, name: null });
  const [auth, setAuth] = useState<AuthState>(DISCONNECTED);
  const [mode, setMode] = useState<Mode>("solo");
  const [connecting, setConnecting] = useState<Record<AgentKind, boolean>>({ claude: false, codex: false });
  const [models, setModels] = useState<Record<AgentKind, string>>({ claude: "", codex: "" });

  useEffect(() => {
    const offEvent = window.studio.onEvent((m) => {
      setMessages((prev) => {
        const i = prev.findIndex((x) => x.id === m.id);
        if (i === -1) return [...prev, m];
        const next = prev.slice();
        next[i] = m;
        return next;
      });
    });
    const offBusy = window.studio.onBusy(setBusy);
    const offProject = window.studio.onProject((p) => {
      setProject(p);
      setMessages([]); // project change starts fresh conversations
    });
    const offAuth = window.studio.onAuth(setAuth);
    const offMode = window.studio.onMode(setMode);
    void window.studio.getProject().then(setProject);
    void window.studio.getAuth().then(setAuth);
    void window.studio.getMode().then(setMode);
    return () => {
      offEvent();
      offBusy();
      offProject();
      offAuth();
      offMode();
    };
  }, []);

  const claudeMsgs = useMemo(() => messages.filter((m) => m.lane === "claude"), [messages]);
  const codexMsgs = useMemo(() => messages.filter((m) => m.lane === "codex"), [messages]);
  const collab = mode === "collab";
  const anyBusy = busy.claude || busy.codex;

  const connect = async (kind: AgentKind) => {
    setConnecting((c) => ({ ...c, [kind]: true }));
    try {
      const st = await window.studio.connect(kind);
      setAuth((a) => ({ ...a, [kind]: st }));
    } finally {
      setConnecting((c) => ({ ...c, [kind]: false }));
    }
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    window.studio.setMode(m);
  };
  const changeModel = (agent: AgentKind, value: string) => {
    setModels((mm) => ({ ...mm, [agent]: value }));
    window.studio.setModel(agent, value);
  };

  const leftDisabled = !project.cwd || !auth.claude.connected || (collab && !auth.codex.connected);
  const leftPlaceholder = !project.cwd
    ? "先选项目文件夹…"
    : !auth.claude.connected
      ? "请先连接 Claude…"
      : collab && !auth.codex.connected
        ? "请先连接 Codex…"
        : collab
          ? "描述你想做的，回车后 Claude 与 Codex 自动协作完成…"
          : "随时输入…（Enter 发送，Shift+Enter 换行）";

  return (
    <div className="app">
      <ProjectBar
        project={project}
        busy={anyBusy}
        mode={mode}
        onPick={() => void window.studio.pickProject()}
        onMode={changeMode}
      />
      <div className="split">
        <section className="left">
          <div className="col-head">
            <AgentChip
              label="Claude · 规划/审查"
              accent="#d97757"
              status={auth.claude}
              connecting={connecting.claude}
              onConnect={() => void connect("claude")}
            />
            <select
              className="model-select"
              value={models.claude}
              onChange={(e) => changeModel("claude", e.target.value)}
              title="Claude 模型"
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <Conversation
            messages={claudeMsgs}
            hasProject={!!project.cwd}
            emptyTitle={collab ? "描述你想做的东西" : "说说你想做什么"}
            emptySub={
              collab
                ? "回车后 Claude 规划 → Codex 自动执行 → Claude 审查，全程自动，无需手动操作。"
                : "Claude 会先帮你规划。切到「双向」可让 Claude 和 Codex 自动协作完成。"
            }
          />
          <Composer
            busy={collab ? anyBusy : busy.claude}
            disabled={leftDisabled}
            placeholder={leftPlaceholder}
            onSend={(t) => void window.studio.send(t, "claude")}
            onStop={() => window.studio.abort("claude")}
          />
        </section>
        <section className="right">
          <div className="col-head">
            <AgentChip
              label="Codex · 写码"
              accent="#10a37f"
              status={auth.codex}
              connecting={connecting.codex}
              onConnect={() => void connect("codex")}
            />
            <select
              className="model-select"
              value={models.codex}
              onChange={(e) => changeModel("codex", e.target.value)}
              title="Codex 模型"
            >
              {CODEX_MODELS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <RightPanel
            mode={mode}
            messages={codexMsgs}
            busy={busy.codex}
            orchestrating={collab && anyBusy}
            hasProject={!!project.cwd}
            codexConnected={auth.codex.connected}
            onSend={(t) => void window.studio.send(t, "codex")}
            onStop={() => window.studio.abort("codex")}
          />
        </section>
      </div>
    </div>
  );
}
