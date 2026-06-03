import { Message } from "./chat-interface";
import MessageItem from "./message-item";

interface MessageListProps {
  messages: Message[];
  error: string | null;
}

export default function MessageList({ messages, error }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-20">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-lg font-medium">Deep Research Agent</p>
        <p className="text-sm text-zinc-400 mt-2">Enter a topic to start an automated, long-horizon deep research run.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-200 rounded-lg text-sm flex gap-2">
          <span className="font-bold">⚠️ Error:</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
