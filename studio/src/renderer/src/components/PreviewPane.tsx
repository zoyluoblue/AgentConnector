import { createElement, useEffect, useState } from "react";

export function PreviewPane() {
  const [url, setUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = () => {
    void window.studio.getPreview().then((r) => {
      setUrl(r.url);
      setTick((t) => t + 1);
    });
  };

  useEffect(() => {
    refresh();
    const off = window.studio.onPreviewRefresh((u) => {
      setUrl(u);
      setTick((t) => t + 1);
    });
    return off;
  }, []);

  if (!url) {
    return (
      <div className="preview-pane">
        <div className="empty-wrap" style={{ flex: 1 }}>
          <div className="empty">
            <div className="empty-emoji">🖥️</div>
            <div className="empty-title">暂无可预览的页面</div>
            <div className="empty-sub">当项目里出现 index.html（例如 Codex 生成网页后），这里会自动显示运行效果。</div>
            <button type="button" className="ghost-btn" onClick={refresh}>
              刷新
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <button type="button" className="icon-btn" onClick={refresh} title="刷新">
          ⟳
        </button>
        <span className="preview-url">{url.replace("file://", "")}</span>
      </div>
      {createElement("webview", { key: `${url}#${tick}`, src: url, className: "preview-webview" })}
    </div>
  );
}
