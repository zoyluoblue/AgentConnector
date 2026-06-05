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
  const submit = () => {
    const t = text.trim();
    if (!t || disabled || busy) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="composer">
      <textarea
        className="composer-input"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
      />
      {busy ? (
        <button type="button" className="btn stop" onClick={onStop}>
          停止
        </button>
      ) : (
        <button type="button" className="btn send" onClick={submit} disabled={disabled || !text.trim()}>
          发送
        </button>
      )}
    </div>
  );
}
