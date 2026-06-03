import { useState } from "react";

interface ReasoningStepsProps {
  steps: any[];
}

export default function ReasoningSteps({ steps }: ReasoningStepsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Group tool calls and responses
  const toolCallsMap = new Map<string, { name: string; args: any; response?: any }>();
  
  steps.forEach((msg) => {
    if (msg.tool_calls) {
      msg.tool_calls.forEach((tc: any) => {
        toolCallsMap.set(tc.id, { name: tc.name, args: tc.args });
      });
    } else if (msg.type === "tool" || msg.role === "tool") {
      const tcId = msg.tool_call_id;
      const existing = toolCallsMap.get(tcId);
      if (existing) {
        existing.response = msg.content;
      } else {
        // Fallback for orphaned tool response
        toolCallsMap.set(tcId || Math.random().toString(), { 
          name: msg.name || "tool", 
          args: {}, 
          response: msg.content 
        });
      }
    }
  });

  const toolCalls = Array.from(toolCallsMap.values());

  if (toolCalls.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-950/60 p-3 mb-3">
      <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
        Reasoning & Tool Execution Log ({toolCalls.length})
      </div>
      
      <div className="space-y-2">
        {toolCalls.map((tc, idx) => {
          const isExpanded = expandedIndex === idx;
          const isSearch = tc.name.includes("search") || tc.name.includes("exa");
          const isSubagent = tc.name === "task";
          const icon = isSubagent ? "🤖" : isSearch ? "🔍" : "⚙️";

          return (
            <div key={idx} className="border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-900/40">
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                className="w-full text-left px-3 py-2 text-xs font-medium flex items-center justify-between text-zinc-300 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>{icon}</span>
                  <span className="font-mono text-indigo-400">{tc.name}</span>
                  {isSubagent && tc.args.subagent_type && (
                    <span className="bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800 text-[10px]">
                      {tc.args.subagent_type}
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 flex items-center gap-1.5">
                  <span>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-zinc-850 text-[11px] font-mono space-y-2 bg-black/20">
                  <div>
                    <span className="text-zinc-500 font-semibold block mb-0.5">Arguments:</span>
                    <pre className="bg-zinc-900/60 p-2 rounded text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(tc.args, null, 2)}
                    </pre>
                  </div>
                  {tc.response && (
                    <div>
                      <span className="text-zinc-500 font-semibold block mb-0.5">Output:</span>
                      <pre className="bg-zinc-900/60 p-2 rounded text-emerald-400 max-h-48 overflow-y-auto overflow-x-auto whitespace-pre-wrap">
                        {typeof tc.response === "string" ? tc.response : JSON.stringify(tc.response, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
