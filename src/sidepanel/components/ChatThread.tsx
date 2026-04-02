import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types";
import { Markdown } from "./Markdown";

interface ChatThreadProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onClear: () => void;
}

function TypingIndicator() {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        alignItems: "center",
        padding: "10px 12px",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#475569",
            animation: "bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>
        {
          "@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }"
        }
      </style>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "10px",
        padding: "0 12px",
      }}
    >
      <div
        style={{
          maxWidth: "92%",
          padding: "8px 12px",
          borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
          background: isUser ? "#1d4ed8" : "#1e293b",
          color: "#e2e8f0",
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <div style={{ fontSize: "13px", lineHeight: "1.55", whiteSpace: "pre-wrap" }}>
            {message.content}
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
        <div
          style={{
            fontSize: "10px",
            color: isUser ? "#93c5fd" : "#475569",
            marginTop: "4px",
            textAlign: "right",
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatThread({ messages, isLoading, onClear }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-to-bottom intentionally tracks messages+isLoading as triggers
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #2d3748",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          {messages.length > 0
            ? `${messages.length} message${messages.length === 1 ? "" : "s"}`
            : "No messages yet"}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={{
              background: "none",
              border: "1px solid #374151",
              borderRadius: "4px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "11px",
              padding: "2px 7px",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: "8px" }}>
        {messages.length === 0 && !isLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#475569",
              fontSize: "13px",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "28px" }}>💬</div>
            <div>Run an analysis first, then ask follow-up questions</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={`${msg.role}-${msg.timestamp}`} message={msg} />
          ))
        )}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
