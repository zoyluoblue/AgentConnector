import { type ReactNode, useEffect, useState } from "react";
import { useLang } from "../i18n";
import type { SearchHit, Session, SessionMeta } from "../../../shared/ipc";
import { type DateGroup, dateGroup, relTime } from "../lib/time";
import { Conversation } from "./Conversation";

const GROUP_ORDER: DateGroup[] = ["today", "yesterday", "week", "earlier"];

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

function hitName(role: string): { icon: string; color: string; label?: string } {
  if (role === "claude") return { icon: "psychology", color: "#5856D6" };
  if (role === "codex") return { icon: "code", color: "#0050cb" };
  return { icon: "person", color: "#0050cb" };
}

function ModeBadge({ collab, solo, dual }: { collab: boolean; solo: string; dual: string }) {
  return (
    <span
      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
        collab ? "bg-primary/10 text-primary" : "bg-surface-variant text-on-surface-variant"
      }`}
    >
      {collab ? dual : solo}
    </span>
  );
}

export function HistoryView() {
  const { t, lang } = useLang();
  const [metas, setMetas] = useState<SessionMeta[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  const refresh = () => void window.studio.listHistory().then(setMetas);
  useEffect(() => void refresh(), []);
  // Debounced full-text search across all saved conversations.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => void window.studio.search(q).then(setHits), 220);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!selId && metas.length) setSelId(metas[0].id);
  }, [metas, selId]);
  useEffect(() => {
    if (!selId) {
      setDetail(null);
      return;
    }
    void window.studio.getSession(selId).then(setDetail);
    setRenaming(false);
  }, [selId]);

  const onDelete = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await window.studio.deleteSession(id);
    if (selId === id) setSelId(null);
    refresh();
  };
  const commitRename = async () => {
    const title = draft.trim();
    if (detail && title) {
      await window.studio.renameSession(detail.id, title);
      setDetail({ ...detail, title });
      refresh();
    }
    setRenaming(false);
  };

  if (metas.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-8">
        <div className="text-center max-w-[320px]">
          <span className="material-symbols-outlined text-[40px] text-primary/30 mb-3">history</span>
          <p className="font-headline text-headline text-on-surface mb-1.5">{t("noHistory")}</p>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">{t("noHistorySub")}</p>
        </div>
      </div>
    );
  }

  const groups = GROUP_ORDER.map((g) => ({ g, items: metas.filter((m) => dateGroup(m.updatedAt) === g) })).filter((x) => x.items.length);
  const groupLabel: Record<DateGroup, string> = {
    today: t("grpToday"),
    yesterday: t("grpYesterday"),
    week: t("grpWeek"),
    earlier: t("grpEarlier"),
  };

  return (
    <div className="flex-1 min-h-0 flex bg-surface-container-lowest">
      {/* list */}
      <div className="w-[340px] shrink-0 border-r border-outline-variant/30 overflow-y-auto px-3 py-4">
        <div className="px-2 mb-3">
          <h2 className="font-headline text-headline text-on-surface">{t("historyTitle")}</h2>
          <p className="text-body-sm text-on-surface-variant mt-0.5 leading-snug">{t("historySub")}</p>
        </div>
        <div className="relative px-1 mb-3">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("historySearchPh")}
            className="w-full bg-surface-container rounded-lg pl-10 pr-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {query.trim() ? (
          hits.length === 0 ? (
            <p className="px-2 py-6 text-center text-body-sm text-on-surface-variant/60">{t("noResults")}</p>
          ) : (
            <div className="space-y-1">
              {hits.map((h) => {
                const v = hitName(h.role);
                return (
                  <button
                    type="button"
                    key={`${h.sessionId}:${h.messageId}`}
                    onClick={() => void window.studio.resumeSession(h.sessionId, h.messageId)}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-variant/50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant mb-0.5">
                      <span className="material-symbols-outlined text-[14px]" style={{ color: v.color }}>
                        {v.icon}
                      </span>
                      <span className="truncate flex-1">{h.sessionTitle}</span>
                      <span className="shrink-0 opacity-60">{relTime(h.ts, lang)}</span>
                    </div>
                    <p className="text-body-sm text-on-surface leading-snug line-clamp-2">{highlight(h.snippet, query.trim())}</p>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          groups.map(({ g, items }) => (
          <div key={g} className="mb-4">
            <div className="text-label-caps font-bold text-on-surface-variant/50 px-2 mb-1">{groupLabel[g]}</div>
            <div className="space-y-0.5">
              {items.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setSelId(m.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                    selId === m.id ? "bg-primary/10" : "hover:bg-surface-variant/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ModeBadge collab={m.mode === "collab"} solo={t("soloBadge")} dual={t("dualBadge")} />
                    <span className={`truncate font-medium text-body-lg ${selId === m.id ? "text-primary" : "text-on-surface"}`}>{m.title}</span>
                  </div>
                  <div className="text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className="truncate max-w-[120px]">{m.projectName}</span>
                    <span className="opacity-40">·</span>
                    <span className="shrink-0">{relTime(m.updatedAt, lang)}</span>
                    <span className="opacity-40">·</span>
                    <span className="shrink-0">
                      {m.messageCount} {t("msgsUnit")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          ))
        )}
      </div>

      {/* detail */}
      <div className="flex-1 min-w-0 flex flex-col">
        {detail ? (
          <>
            <div className="shrink-0 px-5 py-3 border-b border-outline-variant/30 flex items-center gap-3 bg-surface">
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenaming(false);
                    }}
                    // biome-ignore lint/a11y/noAutofocus: rename starts on explicit click
                    autoFocus
                    className="w-full bg-surface-container border border-primary/40 rounded-lg px-2 py-1 font-headline text-headline text-on-surface outline-none"
                  />
                ) : (
                  <h3 className="font-headline text-headline text-on-surface truncate">{detail.title}</h3>
                )}
                <p className="text-body-sm text-on-surface-variant truncate mt-0.5">
                  {detail.projectName} · {relTime(detail.updatedAt, lang)} · {detail.messages.length} {t("msgsUnit")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void window.studio.resumeSession(detail.id)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white text-body-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                {t("resume")}
              </button>
              <button
                type="button"
                title={t("rename")}
                onClick={() => {
                  setDraft(detail.title === "（未命名对话）" ? "" : detail.title);
                  setRenaming(true);
                }}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-variant/60 hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button
                type="button"
                title={t("remove")}
                onClick={() => void onDelete(detail.id)}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
            <Conversation messages={detail.messages} hasProject emptyTitle="" emptySub="" />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-body-lg text-on-surface-variant/60">{t("selectSessionHint")}</div>
        )}
      </div>
    </div>
  );
}
