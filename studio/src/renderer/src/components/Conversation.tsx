import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import type { ChatMessage } from "../../../shared/ipc";

function Thinking() {
  return (
    <span className="inline-flex gap-1 items-center h-5">
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function NLabel({ n, side }: { n: number; side: "start" | "end" }) {
  return <span className={`text-[11px] font-bold text-on-surface-variant/45 ${side === "end" ? "pr-1" : "pl-1"}`}>#{n}</span>;
}

function ClaudeCard({ m }: { m: ChatMessage }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-start gap-1">
      <NLabel n={m.n} side="start" />
      <div className="w-full bg-claude/5 border border-claude/20 rounded-xl p-stack_md mac-shadow">
        <div className="flex items-center gap-stack_sm mb-stack_sm">
          <div className="w-8 h-8 rounded-full bg-claude flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              psychology
            </span>
          </div>
          <div className="leading-tight">
            <h3 className="font-headline text-body-lg font-bold text-claude">Claude</h3>
            <p className="text-label-caps text-claude/60">{t("planReview")}</p>
          </div>
        </div>
        <div className="text-body-lg text-on-surface whitespace-pre-wrap">{m.text || (m.pending ? <Thinking /> : "")}</div>
      </div>
    </div>
  );
}

function CodexCard({ m }: { m: ChatMessage }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-start gap-1">
      <NLabel n={m.n} side="start" />
      <div className="w-full bg-surface rounded-xl border border-outline-variant/30 overflow-hidden mac-shadow">
        <div className="flex items-center justify-between px-stack_md py-2 bg-surface-container">
          <div className="flex items-center gap-stack_sm">
            <div className="w-6 h-6 rounded bg-on-surface flex items-center justify-center text-surface">
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                code
              </span>
            </div>
            <span className="text-body-sm font-code font-medium">Codex</span>
          </div>
          {m.pending && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">EXECUTING</span>}
        </div>
        <div className="p-4 bg-[#0d1117] text-[#c9d1d9] font-code text-[13px] leading-relaxed whitespace-pre-wrap break-words">
          {m.text || (m.pending ? <span className="text-[#8b949e]">{t("executing")}</span> : "")}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <NLabel n={m.n} side="end" />
      <div className="max-w-[82%] bg-primary text-white rounded-xl rounded-tr-sm px-stack_md py-stack_sm text-body-lg whitespace-pre-wrap mac-shadow">
        {m.text}
      </div>
    </div>
  );
}

function SystemLine({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-center">
      <span
        className={`text-body-sm px-3 py-1 rounded-full ${
          m.kind === "error" ? "bg-error/10 text-error" : "bg-surface-container text-on-surface-variant"
        }`}
      >
        {m.text}
      </span>
    </div>
  );
}

interface Props {
  messages: ChatMessage[];
  hasProject: boolean;
  emptyTitle: string;
  emptySub: string;
  /** scroll to + briefly highlight this message (e.g. a search hit) */
  focusId?: string;
}

export function Conversation({ messages, hasProject, emptyTitle, emptySub, focusId }: Props) {
  const { t } = useLang();
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  useEffect(() => {
    // If asked to focus a specific message that's present, scroll there; else stick to bottom.
    const el = focusId ? listRef.current?.querySelector(`[data-mid="${focusId}"]`) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(focusId);
      const timer = setTimeout(() => setHighlightId(undefined), 2200);
      return () => clearTimeout(timer);
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, focusId]);

  if (!hasProject || messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-8">
        <div className="text-center max-w-[340px]">
          <span className="material-symbols-outlined text-[40px] text-primary/30 mb-3">{hasProject ? "auto_awesome" : "folder_open"}</span>
          <p className="font-headline text-headline text-on-surface mb-1.5">{hasProject ? emptyTitle : t("selectFolderTitle")}</p>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">{hasProject ? emptySub : t("selectFolderSub")}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-gutter flex flex-col gap-gutter">
      {messages.map((m) => (
        <div
          key={m.id}
          data-mid={m.id}
          className={
            m.id === highlightId ? "rounded-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-surface-container-lowest transition-shadow" : ""
          }
        >
          {m.role === "user" ? (
            <UserBubble m={m} />
          ) : m.role === "system" ? (
            <SystemLine m={m} />
          ) : m.role === "claude" ? (
            <ClaudeCard m={m} />
          ) : (
            <CodexCard m={m} />
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
