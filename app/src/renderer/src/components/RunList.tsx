import { RUN_DOT, RUN_STATUS_LABEL } from "../api";
import type { Run } from "../types";

export function RunList({
  runs,
  selectedId,
  onSelect,
  onContextMenu,
}: {
  runs: Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (runId: string, x: number, y: number) => void;
}) {
  if (runs.length === 0) {
    return <div className="empty">还没有 Task。<br />在右侧新建一个 →</div>;
  }
  return (
    <div>
      {runs.map((r) => {
        const passed = r.phases.filter((p) => p.status === "passed").length;
        return (
          <div
            key={r.runId}
            className={`task-row${r.runId === selectedId ? " sel" : ""}`}
            onClick={() => onSelect(r.runId)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(r.runId, e.clientX, e.clientY);
            }}
          >
            <div className="top">
              <span className={`dot ${RUN_DOT[r.status] ?? "queued"}`} />
              <span className="label">{r.goal}</span>
            </div>
            <div className="meta">
              {RUN_STATUS_LABEL[r.status] ?? r.status}
              {r.phases.length > 0 ? ` · ${passed}/${r.phases.length} 阶段` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
