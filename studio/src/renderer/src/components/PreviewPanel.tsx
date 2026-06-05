import { useState } from "react";

type Tab = "preview" | "diff";

export function PreviewPanel() {
  const [tab, setTab] = useState<Tab>("preview");
  return (
    <div className="preview">
      <div className="preview-tabs">
        <button type="button" className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
          预览
        </button>
        <button type="button" className={`tab ${tab === "diff" ? "active" : ""}`} onClick={() => setTab("diff")}>
          改动
        </button>
      </div>
      <div className="preview-body">
        <div className="empty">
          <div className="empty-emoji">{tab === "preview" ? "🖥️" : "📝"}</div>
          <div className="empty-title">{tab === "preview" ? "成果预览会出现在这里" : "代码改动会出现在这里"}</div>
          <div className="empty-sub">
            {tab === "preview"
              ? "等 Codex 写完代码，这里会实时显示运行效果。"
              : "等 Codex 写完代码，这里会显示改了哪些文件、改了什么。"}
          </div>
        </div>
      </div>
    </div>
  );
}
