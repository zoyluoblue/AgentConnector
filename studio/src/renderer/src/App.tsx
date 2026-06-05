import { useEffect, useMemo, useState } from "react";
import type { AgentKind, AuthState, BusyState, ChatMessage, Mode, ProjectInfo } from "../../shared/ipc";
import { AgentHeader } from "./components/AgentHeader";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { RightPanel } from "./components/RightPanel";
import { TopBar } from "./components/TopBar";

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
      setMessages([]);
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
          ? "描述你想做的，回车后 Claude 与 Codex 自动协作…"
          : "和 Claude 聊聊你想做什么…（Enter 发送）";

  return (
    <div className="app">
      <TopBar project={project} mode={mode} busy={anyBusy} onPick={() => void window.studio.pickProject()} onMode={changeMode} />
      <div className="split">
        <section className="panel left">
          <AgentHeader
            kind="claude"
            name="Claude"
            role="规划 · 审查"
            status={auth.claude}
            connecting={connecting.claude}
            onConnect={() => void connect("claude")}
            models={CLAUDE_MODELS}
            model={models.claude}
            onModel={(v) => changeModel("claude", v)}
          />
          <Conversation
            messages={claudeMsgs}
            hasProject={!!project.cwd}
            emptyTitle={collab ? "描述你想做的东西" : "说说你想做什么"}
            emptySub={
              collab
                ? "回车后 Claude 规划 → Codex 自动执行 → Claude 审查，全程自动。"
                : "Claude 先帮你规划。切到「双向」可让 Claude 和 Codex 自动协作完成。"
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
        <section className="panel right">
          <AgentHeader
            kind="codex"
            name="Codex"
            role="写码 · 执行"
            status={auth.codex}
            connecting={connecting.codex}
            onConnect={() => void connect("codex")}
            models={CODEX_MODELS}
            model={models.codex}
            onModel={(v) => changeModel("codex", v)}
          />
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
