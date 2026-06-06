import { useState } from "react";
import { useLang } from "../i18n";
import type { ChatMessage } from "../../../shared/ipc";
import { AgentPanelHeader } from "./AgentPanelHeader";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { LivePreview } from "./LivePreview";

interface ComposerProps {
  busy: boolean;
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

interface Props {
  header: Parameters<typeof AgentPanelHeader>[0];
  messages: ChatMessage[];
  hasProject: boolean;
  emptyTitle: string;
  emptySub: string;
  composer?: ComposerProps;
}

export function AgentPanel({ header, messages, hasProject, emptyTitle, emptySub, composer }: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<"chat" | "preview">("chat");

  return (
    <div className="w-1/2 min-w-0 flex flex-col gap-gutter min-h-0">
      <AgentPanelHeader {...header} />
      <div className="flex-1 min-h-0 flex flex-col bg-surface rounded-xl border border-outline-variant/30 overflow-hidden mac-shadow">
        <div className="flex gap-1 px-3 pt-2 shrink-0">
          {(["chat", "preview"] as const).map((tk) => (
            <button
              type="button"
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-3.5 py-1.5 rounded-t-lg text-body-sm font-medium transition-colors ${
                tab === tk ? "bg-surface-container-low text-primary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t(tk === "chat" ? "tabChat" : "tabPreview")}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 flex flex-col border-t border-outline-variant/10">
          {tab === "preview" ? (
            <LivePreview />
          ) : (
            <>
              <Conversation messages={messages} hasProject={hasProject} emptyTitle={emptyTitle} emptySub={emptySub} />
              {composer && <Composer {...composer} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
