import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage, safeMarkdownUrl } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders common conversational Markdown as structured elements", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage source={'# Heading\n\nA *paragraph* with **emphasis**.\n\n- first\n- second\n\n> quoted\n\n`inline`\n\n```ts\nconst answer = 42;\n```\n\n| Name | Value |\n| --- | --- |\n| answer | 42 |'} />);

    expect(markup).toContain("<h1>Heading</h1>");
    expect(markup).toContain("<p>A <em>paragraph</em> with <strong>emphasis</strong>.</p>");
    expect(markup).toContain("<ul>\n<li>first</li>\n<li>second</li>\n</ul>");
    expect(markup).toContain("<blockquote>\n<p>quoted</p>\n</blockquote>");
    expect(markup).toContain("<code>inline</code>");
    expect(markup).toContain('class="language-ts"');
    expect(markup).toContain("<table>");
    expect(markup).toContain("<th>Name</th>");
  });

  it("keeps raw HTML and network images inert", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage source={'before <span onclick="alert(1)">unsafe</span> ![tracking image](https://example.com/pixel.gif) after'} />);

    expect(markup).not.toContain("<span onclick");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("https://example.com/pixel.gif");
    expect(markup).toContain("[Image: tracking image]");
  });

  it("allows relative, HTTP, HTTPS, and mailto links only", () => {
    expect(safeMarkdownUrl("docs/guide.md")).toBe("docs/guide.md");
    expect(safeMarkdownUrl("#section")).toBe("#section");
    expect(safeMarkdownUrl("https://example.com")).toBe("https://example.com");
    expect(safeMarkdownUrl("mailto:team@example.com")).toBe("mailto:team@example.com");
    expect(safeMarkdownUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeMarkdownUrl("java\nscript:alert(1)")).toBeUndefined();
    expect(safeMarkdownUrl("data:text/html,alert(1)")).toBeUndefined();
    expect(safeMarkdownUrl("//example.com")).toBeUndefined();
    expect(safeMarkdownUrl("/\\evil.example")).toBeUndefined();

    const markup = renderToStaticMarkup(<MarkdownMessage source="[unsafe](javascript:alert(1)) [safe](https://example.com)" />);
    expect(markup).not.toContain("href=\"javascript:");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it("safely rerenders incomplete streamed Markdown", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage source="## Streaming response\n\n```ts\nconst value = 1;" />);

    expect(markup).toContain("Streaming response");
    expect(markup).toContain("const value = 1;");
    expect(markup).not.toContain("<script");
  });
});
