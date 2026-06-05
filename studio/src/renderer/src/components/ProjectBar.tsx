import type { Mode, ProjectInfo } from "../../../shared/ipc";

interface Props {
  project: ProjectInfo;
  busy: boolean;
  mode: Mode;
  onPick: () => void;
  onMode: (m: Mode) => void;
}

export function ProjectBar({ project, busy, mode, onPick, onMode }: Props) {
  return (
    <header className="topbar">
      <span className="brand">AgentConnector</span>
      <button type="button" className="proj-btn" onClick={onPick} title="选择项目文件夹">
        <span className="proj-ico">📁</span>
        {project.name ?? "选择项目…"}
      </button>
      <span className="spacer" />
      <div className="mode-toggle" title="单点：左右各自和 LLM 对话 · 双向：Claude 规划、Codex 执行">
        <button type="button" className={mode === "solo" ? "active" : ""} onClick={() => onMode("solo")}>
          单点
        </button>
        <button type="button" className={mode === "collab" ? "active" : ""} onClick={() => onMode("collab")}>
          双向
        </button>
      </div>
      <span className={`status ${busy ? "busy" : "idle"}`}>{busy ? "进行中…" : "就绪"}</span>
    </header>
  );
}
