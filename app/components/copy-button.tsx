"use client";

import { useCopyToClipboard } from "@/app/lib/use-copy";
import { IconCheck, IconCopy } from "./icons";

interface Props {
  text: string;
  label?: string;
}

export default function CopyButton({ text, label = "Copy" }: Props) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      onClick={() => copy(text)}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-zinc-100"
      title={copied ? "Copied!" : label}
    >
      {copied ? (
        <>
          <IconCheck size={13} className="text-emerald-400" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <IconCopy size={13} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
