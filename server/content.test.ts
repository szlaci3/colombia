import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extractContent, importContent } from "./extract-content.ts";
import { createUrlImportHandler } from "./url-import-handler.ts";

const example = readFileSync(
  new URL("../public/examples/studio-notes.html", import.meta.url),
  "utf8",
);
const base = "https://formlane.netlify.app/examples/studio-notes.html";

describe("webpage content extraction", () => {
  it("exports headings, numbered lists, absolute links, captions, tables, quotes, and code from main content", () => {
    const result = extractContent(example, base);
    expect(result.scope).toBe("main");
    expect(result.markdown).toContain("# A better Monday meeting");
    expect(result.markdown).toMatch(/1\.\s+What are we trying/);
    expect(result.markdown).toContain(
      "[open Formlane](https://formlane.netlify.app/)",
    );
    expect(result.markdown).toContain("**Meeting plan**");
    expect(result.markdown).toContain("| Idea | Next step | Owner |");
    expect(result.markdown).toContain("> Make the idea visible");
    expect(result.markdown).toContain("```");
    expect(result.markdown).toContain(`Source: ${base}`);
    expect(result.markdown).not.toContain("Example page");
    expect(result.markdown).not.toContain("This is a sample page");
    const table = result.sections.find((section) => section.type === "table");
    expect(table?.headers).toEqual(["Idea", "Next step", "Owner"]);
    expect(table?.rows).toHaveLength(3);
    expect(
      result.sections
        .filter((section) => section.type === "text")
        .some(
          (section) =>
            section.body.includes("• ") || section.body.includes("1. What"),
        ),
    ).toBe(true);
  });
  it("prefers article content when there is no main element and falls back honestly to body", () => {
    const article = extractContent(
      "<nav>Ignore</nav><article><h1>Article</h1><p>Useful text.</p></article><aside>Ignore too</aside>",
      base,
    );
    expect(article.scope).toBe("article");
    expect(article.markdown).not.toContain("Ignore");
    const body = extractContent(
      "<header>Menu</header><div>A simple page.</div><footer>Legal</footer>",
      base,
    );
    expect(body.scope).toBe("body");
    expect(body.sections[0].type).toBe("text");
    expect(body.markdown).toContain("A simple page.");
    expect(body.markdown).not.toMatch(/Menu|Legal/);
  });
  it("removes active markup, hidden elements, and unsafe link schemes without executing or fetching media", () => {
    const result = extractContent(
      `<main><h1>Safe</h1><p><a href="javascript:alert(1)">Bad link</a> <a href="data:text/html,hi">Bad data</a> <a href="/guide">Guide</a></p><script>window.compromised=true</script><iframe src="https://127.0.0.1">Private</iframe><p hidden>Hidden</p><p aria-hidden="true">More hidden</p><p style="display:none">Invisible</p><img src="https://127.0.0.1/track" alt="&lt;script&gt;alert(1)&lt;/script&gt;"></main>`,
      base,
    );
    expect(result.markdown).not.toMatch(
      /javascript:|data:text|compromised|127\.0\.0\.1|<script>|Hidden|Invisible|Private/,
    );
    expect(result.markdown).toContain(
      "[Guide](https://formlane.netlify.app/guide)",
    );
    expect(result.markdown).toContain("&lt;script&gt;");
    expect(result.markdown).not.toContain("![");
  });
  it("preserves nested list structure, inline code, and safe mail links in Markdown", () => {
    const result = extractContent(
      '<main><h1>Notes</h1><ol start="3"><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ol><p><code>&lt;tag&gt;</code> <a href="mailto:hello@example.com">Email</a></p></main>',
      base,
    );
    expect(result.markdown).toContain("3.");
    expect(result.markdown).toContain("-");
    expect(result.markdown).toContain("`<tag>`");
    expect(result.markdown).toContain("[Email](mailto:hello@example.com)");
    const section = result.sections[0];
    if (section.type !== "text") throw new Error("Expected text");
    expect(section.body).toContain("3. Parent\n  • Child\n4. Next");
  });
  it("rectangularizes irregular tables, promotes missing headers, and explains merged cells", () => {
    const result = extractContent(
      '<main><h1>Table</h1><table><tr></tr><tr><td>A</td><td>B</td></tr><tr><td colspan="2">Merged</td></tr></table></main>',
      base,
    );
    const table = result.sections.find((section) => section.type === "table");
    expect(table?.headers).toEqual(["A", "B"]);
    expect(table?.rows).toEqual([["Merged", ""]]);
    expect(result.notes.join(" ")).toMatch(/Merged table cells/);
    expect(result.notes.join(" ")).toMatch(/first row/);
  });
  it("bounds prototype text and section counts while retaining the supported content in Markdown", () => {
    const html =
      "<main><h1>Long story</h1><p>" + "word ".repeat(8500) + "</p></main>";
    const result = extractContent(html, base);
    expect(result.sections).toHaveLength(20);
    expect(
      result.sections.every(
        (section) => section.type !== "text" || section.body.length <= 2000,
      ),
    ).toBe(true);
    expect(result.notes.join(" ")).toMatch(/first 20/);
    expect(result.markdown.length).toBeGreaterThan(40_000);
  });
  it("bounds tables and fails helpfully on oversized or script-only content", () => {
    const html =
      "<main><table>" +
      Array.from(
        { length: 105 },
        (_, row) =>
          "<tr>" +
          Array.from({ length: 22 }, (_, col) => `<td>${row},${col}</td>`).join(
            "",
          ) +
          "</tr>",
      ).join("") +
      "</table></main>";
    const table = extractContent(html, base).sections.find(
      (section) => section.type === "table",
    );
    expect(table?.headers).toHaveLength(20);
    expect(table?.rows).toHaveLength(100);
    expect(() =>
      extractContent('<div id="root"></div><script>render()</script>', base),
    ).toThrow(/No readable content/);
    expect(() =>
      extractContent("<main><p>" + "a".repeat(100_001) + "</p></main>", base),
    ).toThrow(/too much content/);
  });
  it("keeps words separated across hard line breaks in text and table cells", () => {
    const result = extractContent(
      "<main><h1>Two<br>lines</h1><p>First<br>Second</p><table><tr><th>Note</th></tr><tr><td>One<br>Two</td></tr></table></main>",
      base,
    );
    expect(result.sections[0]).toMatchObject({
      title: "Two lines",
      body: "First\nSecond",
    });
    expect(
      result.sections.find((section) => section.type === "table")?.rows,
    ).toEqual([["One Two"]]);
  });
  it("uses the shared fetcher once and records the final redirected URL", async () => {
    const fetcher = vi.fn().mockResolvedValue({ text: example, url: base });
    const signal = AbortSignal.timeout(1000);
    const result = await importContent(
      "https://formlane.netlify.app/example",
      signal,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://formlane.netlify.app/example",
      "html",
      signal,
    );
    expect(result.source.url).toBe(base);
  });
  it("uses the shared method, origin, JSON, and request-size boundaries for content imports", async () => {
    const importer = vi.fn();
    const handler = createUrlImportHandler(importer);
    const url = "https://formlane.example/api/import-content";
    expect((await handler(new Request(url))).status).toBe(405);
    expect(
      (
        await handler(
          new Request(url, {
            method: "POST",
            headers: {
              origin: "https://other.example",
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          new Request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: " ".repeat(4097),
          }),
        )
      ).status,
    ).toBe(413);
    expect(importer).not.toHaveBeenCalled();
  });
});
