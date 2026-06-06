import { useLang } from "../i18n";
import type { Mode, ProjectInfo } from "../../../shared/ipc";

interface Props {
  project: ProjectInfo;
  mode: Mode;
  onMode: (m: Mode) => void;
  onPick: () => void;
}

export function TopBar({ project, mode, onMode, onPick }: Props) {
  const { lang, t, toggle } = useLang();
  return (
    <header className="h-16 shrink-0 bg-surface/80 backdrop-blur-md border-b border-outline-variant/20 shadow-sm flex justify-between items-center px-margin_page">
      <div className="flex items-center gap-stack_lg">
        <button type="button" onClick={onPick} className="relative w-64 text-left group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] group-hover:text-primary transition-colors">
            folder
          </span>
          <span className="block w-full bg-surface-container-low rounded-lg pl-10 pr-3 py-1.5 text-body-sm text-on-surface-variant truncate group-hover:ring-1 group-hover:ring-primary/30 transition-all">
            {project.name ?? t("selectProject")}
          </span>
        </button>
        <nav className="flex items-center gap-6 h-full">
          <button
            type="button"
            onClick={() => onMode("solo")}
            className={
              mode === "solo"
                ? "text-primary font-bold border-b-2 border-primary pb-1 text-body-lg"
                : "text-on-surface-variant font-medium hover:text-primary transition-colors text-body-lg"
            }
          >
            {t("soloMode")}
          </button>
          <button
            type="button"
            onClick={() => onMode("collab")}
            className={
              mode === "collab"
                ? "text-primary font-bold border-b-2 border-primary pb-1 text-body-lg"
                : "text-on-surface-variant font-medium hover:text-primary transition-colors text-body-lg"
            }
          >
            {t("dualMode")}
          </button>
        </nav>
      </div>
      <button
        type="button"
        onClick={toggle}
        title="切换语言 / Toggle language"
        className="flex items-center gap-1 text-body-sm font-medium"
      >
        <span className={lang === "zh" ? "text-primary font-bold" : "text-on-surface-variant"}>中文</span>
        <span className="text-on-surface-variant/40">/</span>
        <span className={lang === "en" ? "text-primary font-bold" : "text-on-surface-variant"}>EN</span>
      </button>
    </header>
  );
}
