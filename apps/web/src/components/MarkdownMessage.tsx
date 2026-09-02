import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);
const EXTERNAL_SCHEME = /^(?:https?):/i;
// Sanitization by design: strip control characters before scheme validation.
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate control-character stripping
const URL_CONTROL_CHARACTERS = /[\u0000-\u0020\u007f-\u009f]/g;

export function safeMarkdownUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) return undefined;

  const scheme = trimmed.replace(URL_CONTROL_CHARACTERS, "").match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase();
  if (scheme) return SAFE_SCHEMES.has(scheme) ? trimmed : undefined;
  return trimmed;
}

export function markdownUrlTransform(url: string): string | undefined {
  return safeMarkdownUrl(url);
}

const markdownComponents: Components = {
  a: ({ node: _node, href, children, ...props }) => {
    const safeHref = safeMarkdownUrl(href);
    if (!safeHref) return <span className="acp-markdown-link-inert">{children}</span>;
    const external = EXTERNAL_SCHEME.test(safeHref);
    return <a {...props} href={safeHref} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
  },
  img: ({ node: _node, alt }) => <span className="acp-markdown-image-inert">{alt ? `[Image: ${alt}]` : "[Image omitted]"}</span>,
  table: ({ node: _node, children, ...props }) => <div className="acp-markdown-table-wrap"><table {...props}>{children}</table></div>,
};

export function MarkdownMessage({ source }: { source: string }) {
  return <div className="acp-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={markdownUrlTransform} components={markdownComponents}>{source}</Markdown></div>;
}
