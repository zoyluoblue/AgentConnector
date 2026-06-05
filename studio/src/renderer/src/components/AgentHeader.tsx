import type { AgentKind, AuthStatus } from "../../../shared/ipc";

interface ModelOpt {
  v: string;
  label: string;
}
interface Props {
  kind: AgentKind;
  name: string;
  role: string;
  status: AuthStatus;
  connecting: boolean;
  onConnect: () => void;
  models: ModelOpt[];
  model: string;
  onModel: (v: string) => void;
}

export function AgentHeader({ kind, name, role, status, connecting, onConnect, models, model, onModel }: Props) {
  return (
    <div className="agent-header">
      <div className={`avatar avatar-${kind}`}>{kind === "claude" ? "✦" : "{ }"}</div>
      <div className="agent-id">
        <div className="agent-name">{name}</div>
        <div className="agent-role">{role}</div>
      </div>
      <div className="agent-right">
        {status.connected ? (
          <span className="status-pill connected" title={status.detail}>
            <span className="dot" />
            {status.detail ?? "已连接"}
          </span>
        ) : connecting ? (
          <span className="status-pill">连接中…</span>
        ) : (
          <button type="button" className={`connect-btn ${kind}`} onClick={onConnect}>
            连接
          </button>
        )}
        <select className="model-select" value={model} onChange={(e) => onModel(e.target.value)} title="模型">
          {models.map((m) => (
            <option key={m.v} value={m.v}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
