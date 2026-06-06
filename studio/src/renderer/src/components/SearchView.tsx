import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import type { ChatMessage, SearchHit } from "../../../shared/ipc";
import { relTime } from "../lib/time";

interface Props {
  /** all live messages (both lanes) — powers the "当前对话" scope without a round-trip */
  currentMessages: ChatMessage[];
  /** jump to a message in the live chat (search the current conversation) */
  onJumpCurrent: (messageId: string) => void;
  /** dev/deeplink: pre-fill the query box */
  initialQuery?: string;
}

function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/** Bold every case-insensitive occurrence of q within text. */
function highlight(text: string, q: string): ReactNode[] {
  if (!q) return [text];
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let k = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: scanning loop
  for (let at = lower.indexOf(ql, i); at !== -1; at = lower.indexOf(ql, i)) {
    if (at > i) out.push(text.slice(i, at));
    out.push(
      <mark key={k++} className="bg-primary/20 text-primary font-semibold rounded px-0.5">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

function roleIcon(role: string): { icon: string; color: string; label: string } {
  if (role === "claude") return { icon: "psychology", color: "#5856D6", label: "Claude" };
  if (role === "codex") return { icon: "code", color: "#0050cb", label: "Codex" };
  return { icon: "person", color: "#0050cb", label: "" };
}

export function SearchView({ currentMessages, onJumpCurrent, initialQuery = "" }: Props) {
  const { t, lang } = useLang();
  const [q, setQ] = useState(initialQuery);
  const [scope, setScope] = useState<"current" | "all">("all");
  const [allHits, setAllHits] = useState<SearchHit[]>([]);

  // "全部历史": debounced round-trip to the main process.
  useEffect(() => {
    if (scope !== "all") return;
    const query = q.trim();
    if (!query) {
      setAllHits([]);
      return;
    }
    const timer = setTimeout(() => void window.studio.search(query).then(setAllHits), 220);
    return () => clearTimeout(timer);
  }, [q, scope]);

  // "当前对话": filter the live transcript locally.
  const currentHits = useMemo<SearchHit[]>(() => {
    const query = q.trim().toLowerCase();
    if (scope !== "current" || !query) return [];
    return currentMessages
      .filter((m) => m.role !== "system" && m.text.toLowerCase().includes(query))
      .map((m) => {
        const idx = m.text.toLowerCase().indexOf(query);
        return {
          sessionId: "current",
          sessionTitle: "",
          projectName: "",
          messageId: m.id,
          n: m.n,
          role: m.role,
          lane: m.lane,
          ts: m.ts,
          snippet: snippetAround(m.text, idx, query.length),
        } satisfies SearchHit;
      })
      .reverse();
  }, [q, scope, currentMessages]);

  const hits = scope === "current" ? currentHits : allHits;
  const onHit = (h: SearchHit) => {
    if (h.sessionId === "current") onJumpCurrent(h.messageId);
    else void window.studio.resumeSession(h.sessionId, h.messageId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest">
      {/* search bar */}
      <div className="shrink-0 px-5 pt-5 pb-3 border-b border-outline-variant/30 bg-surface">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            // biome-ignore lint/a11y/noAutofocus: search view is opened to type immediately
            autoFocus
            className="w-full bg-surface-container rounded-xl pl-11 pr-3 py-2.5 text-body-lg text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          {(["current", "all"] as const).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded-full text-body-sm font-medium transition-colors ${
                scope === s ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t(s === "current" ? "scopeCurrent" : "scopeAll")}
            </button>
          ))}
          {q.trim() && (
            <span className="ml-auto text-body-sm text-on-surface-variant">
              {hits.length} {t("resultsUnit")}
            </span>
          )}
        </div>
      </div>

      {/* results */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {!q.trim() ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-[320px]">
              <span className="material-symbols-outlined text-[40px] text-primary/30 mb-3">search</span>
              <p className="text-body-lg text-on-surface-variant">{t("searchHintEmpty")}</p>
            </div>
          </div>
        ) : hits.length === 0 ? (
          <div className="h-full flex items-center justify-center text-body-lg text-on-surface-variant/60">{t("noResults")}</div>
        ) : (
          <div className="space-y-2 max-w-[760px] mx-auto">
            {hits.map((h) => {
              const r = roleIcon(h.role);
              return (
                <button
                  type="button"
                  key={`${h.sessionId}:${h.messageId}`}
                  onClick={() => onHit(h)}
                  className="w-full text-left bg-surface rounded-xl border border-outline-variant/30 p-3.5 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]" style={{ color: r.color }}>
                      {r.icon}
                    </span>
                    <span className="font-medium" style={{ color: r.color }}>
                      {r.label || t("roleYou")}
                    </span>
                    {h.sessionId !== "current" && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="truncate max-w-[200px]">{h.sessionTitle}</span>
                        <span className="opacity-40">·</span>
                        <span className="truncate max-w-[120px]">{h.projectName}</span>
                      </>
                    )}
                    <span className="opacity-40">·</span>
                    <span className="shrink-0">{relTime(h.ts, lang)}</span>
                    <span className="ml-auto text-on-surface-variant/40">#{h.n}</span>
                  </div>
                  <p className="text-body-lg text-on-surface leading-relaxed line-clamp-2">{highlight(h.snippet, q.trim())}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
