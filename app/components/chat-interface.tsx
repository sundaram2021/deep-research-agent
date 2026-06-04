"use client";

import { useEffect, useRef } from "react";
import { useResearchAgent } from "@/app/lib/use-research-agent";
import ChatInput from "./chat-input";
import MessageList from "./message-list";
import EmptyState from "./empty-state";
import BulletPointsCard from "./bullet-points-card";

export default function ChatInterface() {
  const {
    messages,
    loading,
    error,
    researchState,
    send,
    cancel,
    startResearch,
  } = useResearchAgent();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, researchState.phase]);

  const showBullets =
    researchState.phase === "plan-ready" &&
    researchState.bulletPoints.length > 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-6 pb-4 md:px-6"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(q) => send(q)} disabled={loading} />
        ) : (
          <>
            <MessageList
              messages={messages}
              error={error}
              loading={loading}
            />
            {showBullets && (
              <div className="mt-6">
                <BulletPointsCard
                  bullets={researchState.bulletPoints}
                  topic={researchState.originalTopic}
                  onStartResearch={startResearch}
                  disabled={loading}
                />
              </div>
            )}
          </>
        )}
      </div>
      <div className="border-t border-zinc-800/80 bg-zinc-950/70 px-4 py-4 backdrop-blur md:px-6">
        <ChatInput onSend={send} onCancel={cancel} disabled={loading} />
      </div>
    </div>
  );
}
