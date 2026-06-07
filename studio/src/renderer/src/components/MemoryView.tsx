import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import type { MemoryScope, ProjectInfo } from "../../../shared/ipc";

interface Props {
  project: ProjectInfo;
}

export function MemoryView({ project }: Props) {
  const { t } = useLang();
  const hasProject = !!project.cwd;
  const [scope, setScope] = useState<MemoryScope>("global");
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [flash, setFlash] = useState(false);

  // No project open → project memory isn't addressable; fall back to global.
  useEffect(() => {
    if (!hasProject && scope === "project") setScope("global");
  }, [hasProject, scope]);

  // Load the selected scope's memory.
  useEffect(() => {
    let alive = true;
    void window.studio.getMemory(scope).then((c) => {
      if (!alive) return;
      setText(c);
      setSaved(c);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  const dirty = text !== saved;
  const save = async () => {
    await window.studio.setMemory(scope, text);
    setSaved(text);
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-[820px] mx-auto px-6 py-6 h-full flex flex-col">
        <div className="mb-5 shrink-0">
          <h2 className="font-display text-display text-on-surface">{t("memoryTitle")}</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">{t("memorySub")}</p>
        </div>

        {/* scope tabs */}
        <div className="flex gap-1.5 mb-3 shrink-0">
          {(["global", "project"] as MemoryScope[]).map((s) => {
            const disabled = s === "project" && !hasProject;
            return (
              <button
                type="button"
                key={s}
                disabled={disabled}
                onClick={() => setScope(s)}
                className={`px-3.5 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
                  scope === s
                    ? "bg-primary text-white"
                    : disabled
                      ? "text-on-surface-variant/40 cursor-not-allowed"
                      : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {s === "global" ? t("memGlobal") : t("memProject")}
              </button>
            );
          })}
          {scope === "project" && project.name && (
            <span className="self-center text-body-sm text-on-surface-variant/70 ml-1 truncate">· {project.name}</span>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-surface rounded-xl border border-outline-variant/30 p-4 mac-shadow">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("memPlaceholder")}
            spellCheck={false}
            className="flex-1 min-h-[300px] w-full resize-none bg-transparent font-code text-body-sm leading-relaxed text-on-surface placeholder:text-on-surface-variant/40 outline-none"
          />
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-outline-variant/20 shrink-0">
            <span className="text-body-sm text-on-surface-variant/70">{`${t("memChars")}: ${text.length}`}</span>
            <div className="flex items-center gap-3">
              {flash && <span className="text-body-sm text-[#27C93F]">{`✓ ${t("applied")}`}</span>}
              <button
                type="button"
                onClick={save}
                disabled={!dirty}
                className="px-4 py-1.5 rounded-lg text-body-sm font-semibold text-white bg-primary hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dirty ? t("save") : t("saved")}
              </button>
            </div>
          </div>
        </div>

        <p className="text-body-sm text-on-surface-variant/60 mt-3 flex items-center gap-1.5 shrink-0">
          <span className="material-symbols-outlined text-[15px]">info</span>
          {t("memHint")}
        </p>
      </div>
    </div>
  );
}
