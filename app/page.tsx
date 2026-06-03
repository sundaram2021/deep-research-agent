import ChatInterface from "./components/chat-interface";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="border-b border-zinc-800 bg-zinc-900/40 backdrop-blur py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧬</span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-100">Deep Research Agent</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Autonomous LangGraph Swarm</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-1 rounded border border-emerald-800 font-mono">
            Active session
          </span>
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  );
}
