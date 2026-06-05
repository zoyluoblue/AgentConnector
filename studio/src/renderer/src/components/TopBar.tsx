import type { Mode, ProjectInfo } from "../../../shared/ipc";

interface Props {
  project: ProjectInfo;
  mode: Mode;
  busy: boolean;
  onPick: () => void;
  onMode: (m: Mode) => void;
}

export function TopBar({ project, mode, busy, onPick, onMode }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">AgentConnector</span>
      </div>
      <button type="button" className="project-pill" onClick={onPick} title="选择项目文件夹">
        <span className="project-ico">▤</span>
        <span className="project-name">{project.name ?? "选择项目"}</span>
      </button>
      <div className="spacer" />
      <div className="segmented">
        <button type="button" className={mode === "solo" ? "active" : ""} onClick={() => onMode("solo")}>
          单点
        </button>
        <button type="button" className={mode === "collab" ? "active" : ""} onClick={() => onMode("collab")}>
          双向
        </button>
      </div>
      <span className={`run-status ${busy ? "busy" : ""}`}>
        <span className="dot" />
        {busy ? "进行中" : "就绪"}
      </span>
    </header>
  );
}
