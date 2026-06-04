"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { IconLoader, IconSend, IconX } from "./icons";

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
}

const MAX = 4000;

export default function ChatInput({ onSend, onCancel, disabled }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (trimmed.length > MAX) return;
    onSend(trimmed);
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (value: string) => {
    setText(value);
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 180) + "px";
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
    >
      <div className="relative flex-1">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? "Agent is running..."
              : "Ask anything. Example: Compare Claude 3.5 Sonnet vs GPT-4o for code review."
          }
          maxLength={MAX}
          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pr-16 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-60"
        />
        <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[10px] text-zinc-600">
          {text.length}/{MAX}
        </div>
      </div>

      {disabled ? (
        <button
          type="button"
          onClick={onCancel}
          className="flex h-12 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          title="Stop"
        >
          <IconX size={14} />
          <span>Stop</span>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {disabled ? <IconLoader size={14} /> : <IconSend size={14} />}
          <span>Send</span>
        </button>
      )}
    </form>
  );
}
