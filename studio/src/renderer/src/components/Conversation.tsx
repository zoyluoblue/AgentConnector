import { useEffect, useRef } from "react";
import type { ChatMessage, Role } from "../../../shared/ipc";

const META: Record<Role, { label: string; mono: string }> = {
  user: { label: "你", mono: "你" },
  claude: { label: "Claude", mono: "✦" },
  codex: { label: "Codex", mono: "{ }" },
  system: { label: "系统", mono: "·" },
};

function Thinking() {
  return (
    <span className="thinking">
      <i />
      <i />
      <i />
    </span>
  );
}

interface Props {
  messages: ChatMessage[];
  hasProject: boolean;
  emptyTitle: string;
  emptySub: string;
}

export function Conversation({ messages, hasProject, emptyTitle, emptySub }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!hasProject) {
    return (
      <div className="conversation empty-wrap">
        <div className="empty">
          <div className="empty-emoji">📂</div>
          <div className="empty-title">先选一个项目文件夹</div>
          <div className="empty-sub">点顶部「选择项目」。选好后即可开始。</div>
        </div>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="conversation empty-wrap">
        <div className="empty">
          <div className="empty-emoji">✨</div>
          <div className="empty-title">{emptyTitle}</div>
          <div className="empty-sub">{emptySub}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="conversation">
      {messages.map((m) => {
        if (m.role === "system") {
          return (
            <div key={m.id} className={`msg msg-system ${m.kind === "error" ? "is-error" : ""}`}>
              <div className="msg-body">
                <div className="msg-text">{m.text}</div>
              </div>
            </div>
          );
        }
        const meta = META[m.role];
        return (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role !== "user" && <div className={`avatar avatar-${m.role}`}>{meta.mono}</div>}
            <div className="msg-body">
              <div className="msg-meta">
                <span className="msg-name">{meta.label}</span>
                <span className="msg-n">#{m.n}</span>
              </div>
              <div className="msg-text">{m.text || (m.pending ? <Thinking /> : "")}</div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
