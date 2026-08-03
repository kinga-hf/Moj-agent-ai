import type { ReactNode } from "react";

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function BriefingMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(<h3 key={`h3-${index}`}>{renderInlineMarkdown(trimmed.slice(4))}</h3>);
      index += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push(<h2 key={`h2-${index}`}>{renderInlineMarkdown(trimmed.slice(3))}</h2>);
      index += 1;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push(<h1 key={`h1-${index}`}>{renderInlineMarkdown(trimmed.slice(2))}</h1>);
      index += 1;
      continue;
    }
    if (/^(-|\*)\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^(-|\*)\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^(-|\*)\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul className="briefing-markdown-list" key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(trimmed)}</p>);
    index += 1;
  }

  return <div className="briefing-markdown">{blocks}</div>;
}
