import type { ReactNode } from "react";

export function MarkdownContent(props: { readonly content: string }) {
  return <div className="row-card space-y-3 p-3 text-sm leading-6">{parseMarkdown(props.content)}</div>;
}

function parseMarkdown(content: string): readonly ReactNode[] {
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(nodes, listItems);
      listItems = [];
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }
    flushList(nodes, listItems);
    listItems = [];
    nodes.push(blockNode(trimmed, nodes.length));
  }
  flushList(nodes, listItems);
  return nodes;
}

function flushList(nodes: ReactNode[], items: readonly string[]): void {
  if (items.length === 0) return;
  nodes.push(
    <ul key={`list-${nodes.length}`} className="list-disc space-y-1 pl-5">
      {items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}
    </ul>,
  );
}

function blockNode(line: string, index: number): ReactNode {
  if (line.startsWith("### ")) return <h3 key={index} className="font-semibold text-[var(--color-text)]">{inlineMarkdown(line.slice(4))}</h3>;
  if (line.startsWith("## ")) return <h2 key={index} className="font-semibold text-[var(--color-text)]">{inlineMarkdown(line.slice(3))}</h2>;
  if (line.startsWith("# ")) return <h2 key={index} className="font-semibold text-[var(--color-text)]">{inlineMarkdown(line.slice(2))}</h2>;
  return <p key={index} className="text-[var(--color-text-secondary)]">{inlineMarkdown(line)}</p>;
}

function inlineMarkdown(text: string): readonly ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-[var(--color-text)]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
