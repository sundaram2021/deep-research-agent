import { Message } from "./chat-interface";
import ReasoningSteps from "./reasoning-steps";

interface MessageItemProps {
  message: Message;
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} w-full`}>
      <div className="text-xs text-zinc-500 mb-1 px-2 uppercase tracking-wider font-semibold">
        {isUser ? "User" : "Deep Research Agent"}
      </div>
      
      <div className={`w-full rounded-2xl p-4 md:p-5 border ${
        isUser 
          ? "bg-zinc-800 border-zinc-700 text-zinc-100 max-w-[85%]" 
          : "bg-zinc-900 border-zinc-800 text-zinc-100"
      }`}>
        {/* Render reasoning steps for assistant */}
        {!isUser && message.steps.length > 0 && (
          <ReasoningSteps steps={message.steps} />
        )}

        {message.content ? (
          <div className="prose prose-invert max-w-none text-zinc-200 leading-relaxed whitespace-pre-wrap mt-3">
            {message.content}
          </div>
        ) : (
          !isUser && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm mt-3 animate-pulse">
              <span>Thinking and gathering data...</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
