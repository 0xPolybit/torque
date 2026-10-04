import { Check, Copy } from "lucide-react";
import { useState } from "react";

const highlightToken = /(--?[\w-]+|\b(?:npm|pnpm|cargo|corepack|rustup|node|git|cd|mkdir|cargo)\b|\b\d+(?:\.\d+)*\b)/g;
const isHighlightToken = /^(?:--?[\w-]+|(?:npm|pnpm|cargo|corepack|rustup|node|git|cd|mkdir)|\d+(?:\.\d+)*)$/;

function tokenClass(token: string): string {
  if (token.startsWith("-")) return "code-token code-token--flag";
  if (/^\d/.test(token)) return "code-token code-token--number";
  return "code-token code-token--command";
}

export function CodeBlock({ value, language, title }: { value: string; language: string; title?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const canHighlight = language === "bash" || language === "powershell";
  const copyLabel = copyState === "copied" ? "Copied" : copyState === "failed" ? "Select and copy" : "Copy command";

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return <div className="docs-code">
    <div className="docs-code__header"><span>{title ?? language}</span><button type="button" onClick={() => void copy()} aria-label={copyLabel} title={copyLabel}>{copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}<span>{copyLabel}</span></button></div>
    <pre><code>{canHighlight ? value.split(highlightToken).map((part, index) => isHighlightToken.test(part) ? <span className={tokenClass(part)} key={`${part}-${index}`}>{part}</span> : part) : value}</code></pre>
    {copyState === "failed" && <p className="docs-code__notice" role="status">Clipboard access is unavailable. Select the command and copy it manually.</p>}
  </div>;
}
