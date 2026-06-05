import { useState } from "react";

interface Props {
  busy: boolean;
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ busy, disabled, placeholder, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [composing, setComposing] = useState(false);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return; // intentionally no busy-check: sending while busy = 插话
    onSend(t);
    setText("");
  };

  return (
    <div className="composer">
      <div className={`composer-box ${disabled ? "is-disabled" : ""}`}>
        <textarea
          className="composer-input"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !composing && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-actions">
          {busy && (
            <button type="button" className="icon-btn danger" onClick={onStop} title="停止">
              ◼
            </button>
          )}
          <button type="button" className="send-btn" onClick={submit} disabled={disabled || !text.trim()} title="发送">
            ↑
          </button>
        </div>
      </div>
      {busy && <div className="composer-hint">运行中 · 可随时输入「插话」给当前任务追加指令</div>}
    </div>
  );
}
