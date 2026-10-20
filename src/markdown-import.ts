import { Lexer, type MarkedToken } from "marked";
import { decodeHTML } from "entities";
import {
  markdownImportSchema,
  type ContentSection,
  type MarkdownImportResult,
} from "./content";

import { MARKDOWN_LIMIT } from "./markdown-example";

// Keep code points intact at the editor's UTF-16 field boundaries.
function bounded(value: string, limit: number) {
  const result = value.slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0, -1) : result;
}

/** Tokenize to plain editor data only. Never call a Markdown HTML renderer. */
export function importMarkdown(
  markdown: string,
  title = "",
): MarkdownImportResult {
  if (!markdown.trim())
    throw new Error("Paste some Markdown to prepare its sections.");
  if (markdown.length > MARKDOWN_LIMIT)
    throw new Error(
      "Markdown is limited to 100,000 characters. Try a shorter document.",
    );
  let tokens: MarkedToken[];
  try {
    tokens = Lexer.lex(markdown, { gfm: true }) as MarkedToken[];
  } catch {
    throw new Error(
      "This Markdown is too deeply nested or complex. Try a smaller document.",
    );
  }
  const notes = new Set<string>([
    "Pasted Markdown is processed only in this browser. No source text, links, or images are sent to a server.",
    "Editable sections use plain text. Links keep their labels, images keep alt text, and code remains literal text. No HTML is rendered or executed.",
    "Copy and download keep your original Markdown, including formatting and any raw HTML. They do not reflect section selection.",
  ]);
  let visits = 0;
  function text(token: MarkedToken, depth = 0): string {
    if (++visits > 30_000 || depth > 40)
      throw new Error(
        "This Markdown is too deeply nested or complex. Try a smaller document.",
      );
    const children = (items: MarkedToken[]) =>
      items.map((item) => text(item, depth + 1)).join("");
    switch (token.type) {
      case "html":
        notes.add(
          "Raw HTML blocks and tags are omitted from editable sections. Text between inline tags can remain as plain text.",
        );
        return "";
      case "code":
      case "codespan":
        return token.text;
      case "space":
      case "hr":
      case "def":
        return "";
      case "br":
        return "\n";
      case "checkbox":
        return token.checked ? "[x] " : "[ ] ";
      case "image":
        return children(token.tokens as MarkedToken[]);
      case "blockquote":
        return `“${token.tokens
          .map((item) => text(item as MarkedToken, depth + 1))
          .filter(Boolean)
          .join("\n\n")}”`;
      case "list":
        return token.items
          .map((item, index) => {
            const content = item.tokens
              .filter((child) => child.type !== "checkbox")
              .map((child) => text(child as MarkedToken, depth + 1))
              .filter(Boolean)
              .join("\n")
              .trim();
            const marker = token.ordered
              ? `${Number(token.start) + index}. `
              : "• ";
            return (
              marker +
              (item.task ? (item.checked ? "[x] " : "[ ] ") : "") +
              content.replace(/\n/g, "\n  ")
            );
          })
          .join("\n");
      case "table":
        notes.add(
          "Tables nested inside lists or quotes become plain text; top-level Markdown tables become editable tables.",
        );
        return [token.header, ...token.rows]
          .map((row) =>
            row
              .map((cell) => children(cell.tokens as MarkedToken[]))
              .join(" | "),
          )
          .join("\n");
      default:
        if ("tokens" in token && token.tokens)
          return children(token.tokens as MarkedToken[]);
        return "text" in token ? decodeHTML(token.text) : "";
    }
  }
  const firstHeading = tokens.find((token) => token.type === "heading");
  const name = bounded(
    title.trim() ||
      (firstHeading && text(firstHeading).trim()) ||
      "Pasted Markdown",
    120,
  );
  const sections: ContentSection[] = [];
  let heading = name;
  let pendingHeading = false;
  let fragments: string[] = [];
  function push(
    section:
      | Omit<Extract<ContentSection, { type: "text" }>, "id">
      | Omit<Extract<ContentSection, { type: "table" }>, "id">,
  ) {
    if (sections.length === 20) {
      notes.add(
        "Only the first 20 editable sections are offered. Copy or download retains the complete original Markdown.",
      );
      return;
    }
    sections.push({ ...section, id: `markdown-${sections.length + 1}` });
  }
  function flush(keepHeadingOnly = true) {
    let body = fragments.join("\n\n").trim();
    if (pendingHeading && !body && keepHeadingOnly)
      push({ type: "text", title: bounded(heading, 2000), body: "" });
    while (body) {
      let end =
        body.length <= 2000 ? body.length : body.lastIndexOf("\n", 2000);
      if (end < 1) end = Math.min(body.length, 2000);
      const chunk = bounded(body.slice(0, end), 2000);
      push({ type: "text", title: bounded(heading, 2000), body: chunk });
      body = body.slice(chunk.length).trimStart();
      if (sections.length === 20 && body) {
        notes.add(
          "Only the first 20 editable sections are offered. Copy or download retains the complete original Markdown.",
        );
        break;
      }
    }
    fragments = [];
    pendingHeading = false;
  }
  for (const token of tokens) {
    if (token.type === "heading") {
      flush();
      heading = text(token).trim() || heading;
      pendingHeading = true;
    } else if (token.type === "table") {
      flush(false);
      const width = Math.min(20, token.header.length);
      if (token.header.length > 20 || token.rows.length > 100)
        notes.add(
          "Editable tables are limited to 20 columns and 100 data rows. Your original Markdown is kept in full.",
        );
      function cell(items: MarkedToken[]) {
        const value = items
          .map((item) => text(item))
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (value.length > 2000)
          notes.add(
            "Long table cells are shortened to 2,000 characters in editable sections. Your original Markdown is kept in full.",
          );
        return bounded(value, 2000);
      }
      const headers = token.header
        .slice(0, width)
        .map(
          (item, i) => cell(item.tokens as MarkedToken[]) || `Column ${i + 1}`,
        );
      const rows = token.rows
        .slice(0, 100)
        .map((row) =>
          Array.from({ length: width }, (_, i) =>
            cell((row[i]?.tokens ?? []) as MarkedToken[]),
          ),
        );
      if (width)
        push({ type: "table", title: bounded(heading, 2000), headers, rows });
    } else {
      const value = text(token).trim();
      if (value) fragments.push(value);
    }
  }
  flush();
  if (!sections.length)
    throw new Error(
      "No editable text or Markdown tables were found. Add a heading or paragraph; raw HTML is not imported.",
    );
  return markdownImportSchema.parse({
    source: { title: name },
    scope: "markdown",
    markdown,
    sections,
    notes: [...notes],
  });
}
