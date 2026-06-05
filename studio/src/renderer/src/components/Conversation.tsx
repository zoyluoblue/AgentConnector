import { useEffect, useRef } from "react";
import type { ChatMessage, Role } from "../../../shared/ipc";

const ROLE_LABEL: Record<Role, string> = { user: "你", claude: "Claude", codex: "Codex", system: "系统" };

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
          <div className="empty-sub">点左上角「选择项目…」。选好后即可开始。</div>
        </div>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="conversation empty-wrap">
        <div className="empty">
          <div className="empty-emoji">💬</div>
          <div className="empty-title">{emptyTitle}</div>
          <div className="empty-sub">{emptySub}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="conversation">
      {messages.map((m) => (
        <div key={m.id} className={`row ${m.role}`}>
          <div className={`bubble ${m.role} ${m.kind}`}>
            <div className="bubble-role">{ROLE_LABEL[m.role]}</div>
            <div className="bubble-text">{m.text || (m.pending ? <span className="dots">思考中</span> : "")}</div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
