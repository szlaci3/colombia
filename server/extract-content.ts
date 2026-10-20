import { load } from "cheerio";
import Turndown from "turndown";
import {
  contentImportSchema,
  type ContentImportResult,
  type ContentSection,
} from "../src/content.ts";
import { fetchPublicText, ImportError } from "./public-fetch.ts";

const plain = (value: string) => value.replace(/\s+/g, " ").trim();
const short = (value: string) => value.slice(0, 2000);
function markdownConverter() {
  const converter = new Turndown({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  const escape = converter.escape.bind(converter);
  converter.escape = (value) =>
    escape(value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return converter;
}

function readTable(html: string, notes: Set<string>) {
  const $ = load(html);
  const table = $("table").first();
  if (table.find("table").length) {
    table.find("table").remove();
    notes.add("Nested tables are omitted from editable tables.");
  }
  const rows = table
    .find("tr")
    .toArray()
    .filter((row) => $(row).children("th,td").length > 0);
  if (!rows.length) return null;
  if (table.find("[rowspan], [colspan]").length)
    notes.add(
      "Merged table cells are flattened; review the resulting columns.",
    );
  const cells = rows.map((row) =>
    $(row)
      .children("th,td")
      .toArray()
      .map((cell) => {
        const copy = $(cell).clone();
        copy.find("br").replaceWith(" ");
        return { text: short(plain(copy.text())), html: $(cell).html() ?? "" };
      }),
  );
  const width = Math.min(20, Math.max(...cells.map((row) => row.length)));
  if (!width) return null;
  if (cells.length > 101 || cells.some((row) => row.length > 20))
    notes.add(
      "Tables are limited to 20 columns and 100 data rows in both exports and prototypes.",
    );
  if (!$(rows[0]).children("th").length)
    notes.add(
      "A table without header cells uses its first row as editable headers.",
    );
  if (
    cells.some((row) =>
      row.some((cell) => plain(load(cell.html).text()).length > 2000),
    )
  )
    notes.add(
      "Long table cells are shortened to 2,000 characters in prototypes.",
    );
  const rectangle = cells
    .slice(0, 101)
    .map((row) =>
      Array.from({ length: width }, (_, i) => row[i] ?? { text: "", html: "" }),
    );
  return {
    title: short(plain(table.children("caption").text())) || "Imported table",
    cells: rectangle,
    headers: rectangle[0].map((cell, i) => cell.text || `Column ${i + 1}`),
    rows: rectangle.slice(1).map((row) => row.map((cell) => cell.text)),
  };
}

export function extractContent(html: string, url: string): ContentImportResult {
  const $ = load(html);
  const title = short(
    plain(
      $("title").first().text() ||
        $("h1").first().text() ||
        new URL(url).hostname,
    ),
  ).slice(0, 120);
  $(
    'script,style,noscript,template,iframe,object,embed,svg,canvas,nav,aside,form,button,input,select,textarea,[role="navigation"],[role="banner"],[role="contentinfo"],[hidden],[aria-hidden="true"],[inert],body > header,body > footer',
  ).remove();
  $("[style]").each((_, element) => {
    if (
      /display\s*:\s*none\b|visibility\s*:\s*hidden\b/i.test(
        $(element).attr("style") ?? "",
      )
    )
      $(element).remove();
  });
  $("img").each((_, image) => {
    const alt = plain($(image).attr("alt") ?? "");
    $(image).replaceWith($("<span></span>").text(alt));
  });
  $("a").each((_, anchor) => {
    try {
      const target = new URL($(anchor).attr("href") ?? "", url);
      if (
        !["https:", "http:", "mailto:"].includes(target.protocol) ||
        target.username ||
        target.password
      )
        throw new Error();
      $(anchor).attr("href", target.href);
    } catch {
      $(anchor).removeAttr("href");
    }
  });
  const scope = $("main").length
    ? "main"
    : $("article").length
      ? "article"
      : "body";
  const root = $(scope).first();
  const notes = new Set<string>([
    `Content was read from the page’s ${scope === "body" ? "body; no main or article element was found" : `${scope} element`}.`,
    "This reads static HTML only. Script-generated content and CSS-based visibility are not evaluated.",
    "Navigation, forms, scripts, and hidden elements are omitted. Images contribute alt text only; no media is downloaded.",
    "Markdown keeps supported headings, lists, links, quotes, code, and tables. Editable text sections use plain text; table cell formatting is flattened.",
  ]);
  const inline = markdownConverter();
  const converter = markdownConverter();
  converter.addRule("safe-table", {
    filter: "table",
    replacement: (_content, node) => {
      const data = readTable(node.outerHTML, notes);
      if (!data) return "";
      const row = (cells: (typeof data.cells)[number]) =>
        "| " +
        cells
          .map((cell) =>
            inline
              .turndown(cell.html)
              .replace(/\|/g, "\\|")
              .replace(/\n+/g, " "),
          )
          .join(" | ") +
        " |";
      return (
        "\n\n" +
        (data.title === "Imported table"
          ? ""
          : `**${inline.escape(data.title)}**\n\n`) +
        [
          row(data.cells[0]),
          "| " + data.headers.map(() => "---").join(" | ") + " |",
          ...data.cells.slice(1).map(row),
        ].join("\n") +
        "\n\n"
      );
    },
  });
  const body = converter.turndown(root.html() ?? "").trim();
  if (!body)
    throw new ImportError(
      "No readable content was found. This page may need scripts or a login. Try a public article or documentation page.",
    );
  const markdown = `Source: ${url}\n\n${body}`;
  if (markdown.length > 100_000)
    throw new ImportError(
      "This page has too much content to export. Try a shorter article or a more specific page.",
    );
  const sections: ContentSection[] = [];
  let heading = title || "Imported content";
  let fragments: string[] = [];
  let pendingHeading = false;
  const push = (
    section:
      | Omit<Extract<ContentSection, { type: "text" }>, "id">
      | Omit<Extract<ContentSection, { type: "table" }>, "id">,
  ) => {
    if (sections.length >= 20) {
      notes.add(
        "Only the first 20 editable sections are offered. The Markdown export contains the rest of the supported content.",
      );
      return;
    }
    sections.push({ ...section, id: `content-${sections.length + 1}` });
  };
  function flush() {
    let text = fragments.join("\n\n").trim();
    if (!text && !pendingHeading) return;
    if (!text) push({ type: "text", title: short(heading), body: "" });
    while (text) {
      let end =
        text.length <= 2000 ? text.length : text.lastIndexOf("\n", 2000);
      if (end < 1) end = Math.min(text.length, 2000);
      push({ type: "text", title: short(heading), body: text.slice(0, end) });
      text = text.slice(end).trimStart();
      if (sections.length >= 20 && text) {
        notes.add(
          "Only the first 20 editable sections are offered. The Markdown export contains the rest of the supported content.",
        );
        break;
      }
    }
    fragments = [];
    pendingHeading = false;
  }
  root
    .find("h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table")
    .each((_, element) => {
      if ($(element).parents("table,ul,ol,blockquote,pre,p").length) return;
      const tag = element.tagName;
      if (/^h[1-6]$/.test(tag)) {
        flush();
        const copy = $(element).clone();
        copy.find("br").replaceWith(" ");
        heading = plain(copy.text()) || heading;
        pendingHeading = true;
        return;
      }
      if (tag === "table") {
        flush();
        const table = readTable($.html(element), notes);
        if (table)
          push({
            type: "table",
            title:
              table.title === "Imported table"
                ? short(heading) || table.title
                : table.title,
            headers: table.headers,
            rows: table.rows,
          });
        return;
      }
      if (tag === "pre") {
        const text = $(element).text().trim();
        if (text) fragments.push(text);
        return;
      }
      if (tag === "ul" || tag === "ol") {
        const lines = $(element)
          .find("li")
          .toArray()
          .map((item) => {
            const own = $(item).clone();
            own.find("ul,ol").remove();
            own.find("br").replaceWith(" ");
            const depth = Math.max(0, $(item).parents("ul,ol").length - 1);
            const parent = $(item).parent();
            const start = Number(parent.attr("start") ?? 1);
            const number =
              (Number.isSafeInteger(start) ? start : 1) +
              parent.children("li").index(item);
            return (
              "  ".repeat(Math.min(6, depth)) +
              (parent.is("ol") ? `${number}. ` : "• ") +
              plain(own.text())
            );
          });
        if (lines.length) fragments.push(lines.join("\n"));
        return;
      }
      const copy = $(element).clone();
      copy.find("br").replaceWith("\n");
      const text = copy
        .text()
        .split("\n")
        .map(plain)
        .filter(Boolean)
        .join("\n");
      if (text) fragments.push(tag === "blockquote" ? `“${text}”` : text);
    });
  flush();
  if (!sections.length && plain(root.text())) {
    heading = title || "Imported content";
    const copy = root.clone();
    copy.find("br").replaceWith(" ");
    copy.find("div,section,article").append(" ");
    fragments = [plain(copy.text())];
    flush();
  }
  if (!sections.length)
    throw new ImportError(
      "No editable text or tables were found on this page. Try another public page.",
    );
  return contentImportSchema.parse({
    source: { url, title },
    scope,
    markdown,
    sections,
    notes: [...notes],
  });
}

export async function importContent(
  url: string,
  signal: AbortSignal,
  fetchText = fetchPublicText,
): Promise<ContentImportResult> {
  const page = await fetchText(url, "html", signal);
  signal.throwIfAborted();
  return extractContent(page.text, page.url);
}
