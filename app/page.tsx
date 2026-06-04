import ChatInterface from "./components/chat-interface";
import { IconSparkles } from "./components/icons";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-900/40 bg-indigo-950/40 text-indigo-300">
            <IconSparkles size={18} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight">Deep Research Agent</h1>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Autonomous LangGraph Swarm</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-emerald-900/60 bg-emerald-950/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  );
}
