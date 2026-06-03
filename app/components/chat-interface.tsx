"use client";

import { useState } from "react";
import ChatInput from "./chat-input";
import MessageList from "./message-list";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: any[];
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (text: string) => {
    setLoading(true);
    setError(null);
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, steps: [] };
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "", steps: [] };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) throw new Error("Failed to start agent run");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No readable stream");

      let assistantText = "";
      let steps: any[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              setError(data.error);
              continue;
            }

            if (data.agent && data.agent.messages) {
              const lastMsg = data.agent.messages[data.agent.messages.length - 1];
              if (lastMsg && lastMsg.content) {
                assistantText = lastMsg.content;
              }
            }

            if (data.tools || data.task) {
              const nodeData = data.tools || data.task;
              if (nodeData.messages) {
                steps = [...steps, ...nodeData.messages];
              }
            }

            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, content: assistantText || m.content, steps: [...m.steps, ...steps] }
                  : m
              )
            );
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 max-w-4xl mx-auto w-full p-4 h-[calc(100vh-2rem)]">
      <div className="flex-1 overflow-y-auto mb-4 pr-1">
        <MessageList messages={messages} error={error} />
      </div>
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}
