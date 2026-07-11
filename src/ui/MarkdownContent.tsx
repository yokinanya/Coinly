import { useMemo, type ReactNode } from "react";

export function MarkdownContent(props: { readonly content: string; readonly plain?: boolean }) {
  const nodes = useMemo(() => parseMarkdown(props.content), [props.content]);
  const className = props.plain
    ? "motion-selection space-y-3 text-sm leading-6"
    : "row-card motion-selection space-y-3 p-3 text-sm leading-6";
  return <div className={className}>{nodes}</div>;
}

function parseMarkdown(content: string): readonly ReactNode[] {
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  let orderedList = false;
  let codeLines: string[] = [];
  let inCodeBlock = false;
  const lines = content.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        nodes.push(<pre key={`code-${nodes.length}`} className="overflow-x-auto rounded-md bg-(--color-surface-muted) p-3 text-xs leading-5"><code>{codeLines.join("\n")}</code></pre>);
        codeLines = [];
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    if (isTableSeparator(lines[lineIndex + 1])) {
      flushList(nodes, listItems, orderedList);
      listItems = [];
      const rows = [tableCells(line)];
      lineIndex += 2;
      while (lineIndex < lines.length && isTableRow(lines[lineIndex])) {
        rows.push(tableCells(lines[lineIndex] ?? ""));
        lineIndex += 1;
      }
      lineIndex -= 1;
      nodes.push(tableNode(rows, nodes.length));
      continue;
    }
    if (!trimmed) {
      flushList(nodes, listItems, orderedList);
      listItems = [];
      continue;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)/);
    const unordered = trimmed.match(/^[-*]\s+(.+)/);
    if (ordered || unordered) {
      const nextOrdered = Boolean(ordered);
      if (listItems.length > 0 && orderedList !== nextOrdered) {
        flushList(nodes, listItems, orderedList);
        listItems = [];
      }
      orderedList = nextOrdered;
      listItems.push(ordered?.[1] ?? unordered?.[1] ?? "");
      continue;
    }
    flushList(nodes, listItems, orderedList);
    listItems = [];
    nodes.push(blockNode(trimmed, nodes.length));
  }
  if (inCodeBlock) nodes.push(<pre key={`code-${nodes.length}`} className="overflow-x-auto rounded-md bg-(--color-surface-muted) p-3 text-xs leading-5"><code>{codeLines.join("\n")}</code></pre>);
  flushList(nodes, listItems, orderedList);
  return nodes;
}

function isTableRow(line: string | undefined): boolean {
  return Boolean(line?.includes("|"));
}

function isTableSeparator(line: string | undefined): boolean {
  if (!line) return false;
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line: string): readonly string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function tableNode(rows: readonly (readonly string[])[], index: number): ReactNode {
  const [header = [], ...body] = rows;
  return (
    <div key={`table-${index}`} className="markdown-table-scroll rounded-md border border-(--color-border)">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead className="bg-(--color-surface-muted)"><tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b border-(--color-border) px-3 py-2 font-semibold text-(--color-text)">{inlineMarkdown(cell)}</th>)}</tr></thead>
        <tbody>{body.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-(--color-border) last:border-0">{header.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-(--color-text-secondary)">{inlineMarkdown(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function flushList(nodes: ReactNode[], items: readonly string[], ordered: boolean): void {
  if (items.length === 0) return;
  const List = ordered ? "ol" : "ul";
  nodes.push(
    <List key={`list-${nodes.length}`} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
      {items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}
    </List>,
  );
}

function blockNode(line: string, index: number): ReactNode {
  if (line.startsWith("### ")) return <h3 key={index} className="font-semibold text-(--color-text)">{inlineMarkdown(line.slice(4))}</h3>;
  if (line.startsWith("## ")) return <h2 key={index} className="font-semibold text-(--color-text)">{inlineMarkdown(line.slice(3))}</h2>;
  if (line.startsWith("# ")) return <h2 key={index} className="font-semibold text-(--color-text)">{inlineMarkdown(line.slice(2))}</h2>;
  return <p key={index} className="text-(--color-text-secondary)">{inlineMarkdown(line)}</p>;
}

function inlineMarkdown(text: string): readonly ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-(--color-text)">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded-sm bg-(--color-surface-muted) px-1 py-0.5 text-xs text-(--color-text)">{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link && isSafeLink(link[2])) {
      return <a key={index} className="text-(--color-accent) underline" href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

function isSafeLink(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
