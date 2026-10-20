import { describe, expect, it } from "vitest";
import { importMarkdown } from "./markdown-import";
import { markdownExample, MARKDOWN_LIMIT } from "./markdown-example";
import {
  appendImportedSections,
  contentImportSchema,
  markdownImportSchema,
} from "./content";
import { createProject, historyReducer, projectSchema } from "./model";
import { loadProject, makeShareUrl, parseProject } from "./storage";

describe("local Markdown adapter", () => {
  it("groups headings, preserves original Markdown, and creates editable tables from the meeting example", () => {
    const result = importMarkdown(markdownExample);
    expect(result.source).toEqual({ title: "A clearer welcome" });
    expect(result.scope).toBe("markdown");
    expect(result.markdown).toBe(markdownExample);
    expect(result.sections[0]).toMatchObject({
      type: "text",
      title: "A clearer welcome",
      body: "Good ideas start with a little room to think. Bring one useful change to the next meeting.",
    });
    const table = result.sections.find((section) => section.type === "table");
    expect(table).toMatchObject({
      title: "Our next steps",
      headers: ["Idea", "Next step", "Owner"],
      rows: [
        ["A warmer welcome", "Explore a new headline", "Alex"],
        ["Less clutter", "Rearrange the sections", "Sam"],
      ],
    });
    expect(result.sections.at(-1)).toMatchObject({
      type: "text",
      body: "“Make the idea visible before you make it complicated.”\n\n• [x] Bring an example\n• [ ] Choose one next step",
    });
  });
  it("keeps links as labels, images as alt text, entities as text, and code literal", () => {
    const result = importMarkdown(
      "# Fish &amp; chips\n\nA **strong** [idea](javascript:alert(1)), ![small &amp; useful](https://images.example/x.png), and &lt;img&gt;.\n\n`&amp;`\n\n```html\n<script>literal()</script>\n```",
    );
    expect(result.sections[0]).toMatchObject({
      title: "Fish & chips",
      body: "A strong idea, small & useful, and <img>.\n\n&amp;\n\n<script>literal()</script>",
    });
    expect(JSON.stringify(result.sections)).not.toContain("javascript:");
    expect(JSON.stringify(result.sections)).not.toContain("https://images");
  });
  it("supports Setext headings, reference links, ordered starts, and nested lists", () => {
    const result = importMarkdown(
      "Meeting\n=======\n\n3. First [idea][link]\n4. Second\n   - Child\n\n[link]: https://example.com",
    );
    expect(result.sections[0]).toMatchObject({
      title: "Meeting",
      body: "3. First idea\n4. Second\n  • Child",
    });
  });
  it("omits raw HTML blocks/tags without rendering them and reports the omission", () => {
    const result = importMarkdown(
      '# Safe\n\n<script>window.pwned=true</script>\n\nHello <b>there</b>.\n\n<iframe src="https://private.example"></iframe>',
    );
    expect(result.sections[0]).toMatchObject({ body: "Hello there." });
    expect(result.notes.join(" ")).toContain("Raw HTML");
    expect(result.markdown).toContain("<script>");
    expect(() => importMarkdown("<script>window.pwned=true</script>")).toThrow(
      /No editable text/,
    );
  });
  it("normalizes ragged tables, escaped pipes, inline formatting, and empty headers", () => {
    const result = importMarkdown(
      "# Plan\n\n| Name | |\n|---|---|\n| **A** \\| B | [Owner](https://example.com) |\n| Short |",
    );
    expect(
      result.sections.find((section) => section.type === "table"),
    ).toMatchObject({
      headers: ["Name", "Column 2"],
      rows: [
        ["A | B", "Owner"],
        ["Short", ""],
      ],
    });
  });
  it("uses a table-only heading as the table title without offering a redundant empty section", () => {
    const result = importMarkdown(
      "# Plan\n\n| Idea | Owner |\n|---|---|\n| Explore | Alex |",
    );
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ type: "table", title: "Plan" });
  });
  it("bounds tables and cells while retaining the complete original document for export", () => {
    const columns = Array.from({ length: 21 }, (_, i) => `C${i}`);
    const source =
      `|${columns.join("|")}|\n|${columns.map(() => "---").join("|")}|\n` +
      Array.from(
        { length: 102 },
        (_, row) =>
          `|${columns.map((_, col) => (row === 0 && col === 0 ? "x".repeat(2100) : String(row))).join("|")}|`,
      ).join("\n");
    const result = importMarkdown(source);
    const table = result.sections.find((section) => section.type === "table")!;
    expect(table.headers).toHaveLength(20);
    expect(table.rows).toHaveLength(100);
    expect(table.rows[0][0]).toHaveLength(2000);
    expect(result.notes.join(" ")).toMatch(/20 columns/);
    expect(result.notes.join(" ")).toMatch(/2,000 characters/);
    expect(result.markdown).toBe(source);
  });
  it("splits long text at field limits without breaking Unicode and explains the section cap", () => {
    const body = "x".repeat(1999) + "🌱" + "y".repeat(2001);
    const result = importMarkdown(body);
    expect(
      result.sections
        .map((section) => (section.type === "text" ? section.body : ""))
        .join(""),
    ).toBe(body);
    expect(
      result.sections.every(
        (section) =>
          section.type === "text" &&
          section.body.length <= 2000 &&
          !/[\uD800-\uDBFF]$/.test(section.body),
      ),
    ).toBe(true);
    const long = importMarkdown("x".repeat(MARKDOWN_LIMIT));
    expect(long.sections).toHaveLength(20);
    expect(long.notes.join(" ")).toContain("first 20");
    expect(long.markdown).toHaveLength(MARKDOWN_LIMIT);
  });
  it("rejects blank, non-content, oversized, and overly nested documents without returning partial results", () => {
    expect(() => importMarkdown(" \n")).toThrow(/Paste some/);
    expect(() => importMarkdown("---")).toThrow(/No editable text/);
    expect(() => importMarkdown("x".repeat(MARKDOWN_LIMIT + 1))).toThrow(
      /100,000/,
    );
    expect(() => importMarkdown("> ".repeat(60) + "Nested")).toThrow(
      /deeply nested/,
    );
  });
  it("uses an optional title without inventing a source URL or weakening website validation", () => {
    const result = importMarkdown("# Heading\r\n\r\nBody", "  Our notes  ");
    expect(result.source).toEqual({ title: "Our notes" });
    expect(result.markdown).toBe("# Heading\r\n\r\nBody");
    expect(markdownImportSchema.safeParse(result).success).toBe(true);
    expect(contentImportSchema.safeParse(result).success).toBe(false);
    expect(
      markdownImportSchema.safeParse({
        ...result,
        sections: [result.sections[0], result.sections[0]],
      }).success,
    ).toBe(false);
  });
  it("round trips imported Markdown through undo, project files, and shared snapshots", () => {
    const initial = createProject();
    const result = importMarkdown(markdownExample);
    const project = appendImportedSections(
      initial,
      "webshop",
      result.sections,
      null,
    );
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const hash = new URL(makeShareUrl(project, "https://formlane.example/"))
      .hash;
    expect(loadProject({ getItem: () => null }, hash).project).toEqual(project);
    const history = historyReducer(
      { past: [], present: initial, future: [] },
      { type: "change", project },
    );
    expect(historyReducer(history, { type: "undo" }).present).toEqual(initial);
    expect(
      historyReducer(historyReducer(history, { type: "undo" }), {
        type: "redo",
      }).present,
    ).toEqual(project);
  });
});
