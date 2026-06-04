"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export default function MarkdownView({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-4 text-2xl font-semibold text-zinc-50">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-xl font-semibold text-zinc-100">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3 text-lg font-semibold text-zinc-200">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-base font-semibold text-zinc-200">{children}</h4>,
          p: ({ children }) => <p className="my-2 leading-relaxed text-zinc-100">{children}</p>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 text-zinc-100">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 text-zinc-100">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200 hover:decoration-indigo-400">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-zinc-50">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = (className ?? "").includes("language-");
            return isBlock ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.875em] text-indigo-200">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800/80 bg-black/50 p-3 font-mono text-[13px] leading-relaxed text-zinc-200">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-indigo-500/60 bg-zinc-900/40 px-3 py-2 italic text-zinc-300">{children}</blockquote>
          ),
          hr: () => <hr className="my-4 border-zinc-800" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-zinc-800/80">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-zinc-900/80 text-left text-zinc-200">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/60">{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-zinc-800/60 last:border-0">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-semibold text-zinc-100">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-zinc-200">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
