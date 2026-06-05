import type { AuthStatus } from "../../../shared/ipc";

interface Props {
  label: string;
  accent: string;
  status: AuthStatus;
  connecting: boolean;
  onConnect: () => void;
}

export function AgentChip({ label, accent, status, connecting, onConnect }: Props) {
  return (
    <div className="agent-chip">
      <span className="agent-dot" style={{ background: status.connected ? "#3fb950" : "#5b6070" }} />
      <span className="agent-name" style={{ color: accent }}>
        {label}
      </span>
      {status.connected ? (
        <span className="agent-detail" title={status.detail}>
          已连接{status.detail ? ` · ${status.detail}` : ""}
        </span>
      ) : connecting ? (
        <span className="agent-detail">连接中…</span>
      ) : (
        <button type="button" className="agent-connect" style={{ borderColor: accent, color: accent }} onClick={onConnect}>
          连接
        </button>
      )}
    </div>
  );
}
