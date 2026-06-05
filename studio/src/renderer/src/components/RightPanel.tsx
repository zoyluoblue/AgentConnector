import { useEffect, useState } from "react";
import type { ChatMessage, Mode } from "../../../shared/ipc";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { PreviewPane } from "./PreviewPane";

interface Props {
  mode: Mode;
  messages: ChatMessage[];
  busy: boolean;
  orchestrating: boolean;
  hasProject: boolean;
  codexConnected: boolean;
  onSend: (t: string) => void;
  onStop: () => void;
}

export function RightPanel({ mode, messages, busy, orchestrating, hasProject, codexConnected, onSend, onStop }: Props) {
  const [tab, setTab] = useState<"work" | "preview">("work");
  useEffect(() => {
    // when a previewable page appears (e.g. Codex just built a site), surface it.
    const off = window.studio.onPreviewRefresh((u) => {
      if (u) setTab("preview");
    });
    return off;
  }, []);

  return (
    <div className="right-inner">
      <div className="tabs">
        <button type="button" className={tab === "work" ? "active" : ""} onClick={() => setTab("work")}>
          {mode === "solo" ? "Codex 对话" : "执行过程"}
        </button>
        <button type="button" className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
          实时预览
        </button>
      </div>
      {tab === "preview" ? (
        <PreviewPane />
      ) : (
        <>
          <Conversation
            messages={messages}
            hasProject={hasProject}
            emptyTitle={mode === "solo" ? "直接和 Codex 对话" : "Codex 执行区"}
            emptySub={
              mode === "solo"
                ? "在下面直接让 Codex 帮你写代码、改文件。"
                : "双向模式下，Codex 会按 Claude 的计划自动执行，无需手动操作。"
            }
          />
          {mode === "solo" ? (
            <Composer
              busy={busy}
              disabled={!hasProject || !codexConnected}
              placeholder={!hasProject ? "先选项目文件夹…" : !codexConnected ? "请先连接 Codex…" : "让 Codex 写点什么…"}
              onSend={onSend}
              onStop={onStop}
            />
          ) : (
            <div className="execute-bar">
              {orchestrating ? (
                <button type="button" className="stop-wide" onClick={onStop}>
                  停止（同时停止 Claude 和 Codex）
                </button>
              ) : (
                <span className="collab-foot-text">Claude 规划 → Codex 执行 → Claude 审查，自动进行</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
