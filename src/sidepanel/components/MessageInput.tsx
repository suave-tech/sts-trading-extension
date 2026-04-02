import { useCallback, useRef, useState } from "react";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Ask a follow-up question…",
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: "10px 12px",
        borderTop: "1px solid #2d3748",
        background: "#0f1117",
        flexShrink: 0,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Waiting for response…" : placeholder}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: "none",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "6px",
          color: "#e2e8f0",
          fontSize: "13px",
          lineHeight: "1.5",
          outline: "none",
          padding: "7px 10px",
          minHeight: "34px",
          maxHeight: "120px",
          overflowY: "auto",
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        style={{
          alignSelf: "flex-end",
          padding: "7px 12px",
          background: disabled || !value.trim() ? "#1e293b" : "#3b82f6",
          color: disabled || !value.trim() ? "#475569" : "white",
          border: "none",
          borderRadius: "6px",
          cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontWeight: 600,
          flexShrink: 0,
          height: "34px",
        }}
      >
        Send
      </button>
    </div>
  );
}
