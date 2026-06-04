import type { Message } from "@/app/lib/event-types";
import MessageItem from "./message-item";
import { IconAlert } from "./icons";

interface Props {
  messages: Message[];
  error: string | null;
  loading: boolean;
}

export default function MessageList({ messages, error, loading }: Props) {
  return (
    <div className="space-y-6">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} loading={loading} />
      ))}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          <IconAlert size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <div className="font-semibold text-red-100">Run failed</div>
            <div className="text-red-300/90">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}
