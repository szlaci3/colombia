import { load } from "cheerio";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { calculate, compare } from "specificity";
import { publicUrl } from "./public-fetch.ts";

export type LinkedStylesheet = { url: string; css: string };
export type StyleObservation = {
  property: string;
  value: string;
  selector: string;
  source: string;
  kind: "page" | "heading" | "action" | "other" | "token";
};
const universalMedia = (media: string) =>
  /^(?:all|screen)?$/i.test(media.trim());
const relevant = (property: string) =>
  property.startsWith("--") ||
  /^(?:color|background(?:-color)?|font-family|border-radius|display|visibility)$/.test(
    property,
  );
const conditionalNote =
  "Conditional, layered, nested, and animated CSS is omitted; responsive and interactive appearances may differ.";
const limitNote =
  "Style analysis samples at most 2,000 rules/selectors, 120 representative elements, and 25,000 declaration applications; some styles may be omitted.";

export function linkedStylesheetUrls(html: string, url: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $("link[rel][href]").each((_, element) => {
    const link = $(element);
    if (
      !link.attr("rel")?.toLowerCase().split(/\s+/).includes("stylesheet") ||
      link.is("[disabled]") ||
      !universalMedia(link.attr("media") ?? "")
    )
      return;
    try {
      urls.add(publicUrl(link.attr("href")!, url).href);
    } catch {
      /* Unsupported URL. */
    }
  });
  return [...urls].slice(0, 3);
}

/** A bounded static author-style sample; deliberately not a browser CSS engine. */
export function collectStyleObservations(
  html: string,
  url: string,
  sheets: (string | LinkedStylesheet)[],
) {
  const $ = load(html);
  // Infer Cheerio's concrete element type without adding a runtime DOM dependency.
  const pageElements = $("html,body").toArray();
  type Node = (typeof pageElements)[number];
  type Winner = StyleObservation & {
    important: boolean;
    inline: boolean;
    specificity: ReturnType<typeof calculate>;
    order: number;
  };
  const notes = new Set<string>();
  const selected = new Set<Node>(pageElements);
  const eligible = (node: Node) =>
    !$(node).closest(
      '[hidden],[aria-hidden="true"],template,noscript,script,style',
    ).length;
  for (const selector of [
    "h1,h2,h3",
    "button,a,[role=button],input[type=submit]",
    "main,article,section,header,footer",
    "body [class],body [style]",
  ]) {
    $(selector)
      .slice(0, 20)
      .each((_, node) => {
        if (!("tagName" in node)) return;
        if (!eligible(node)) return;
        for (const ancestor of $(node).parents().toArray().reverse()) {
          if (selected.size < 120) selected.add(ancestor);
        }
        if (selected.size < 120) selected.add(node);
      });
  }
  const nodes = [...selected];
  if (selected.size === 120) notes.add(limitNote);
  const declarations = new Map(
    nodes.map((node) => [node, new Map<string, Winner>()]),
  );
  let order = 0;
  let ruleCount = 0;
  let selectorCount = 0;
  let applications = 0;
  const kind = (node: Node): StyleObservation["kind"] =>
    $(node).is("html,body")
      ? "page"
      : $(node).is("h1,h2,h3,h4,h5,h6")
        ? "heading"
        : $(node).is("button,a,[role=button],input[type=submit]")
          ? "action"
          : "other";
  const write = (
    node: Node,
    decl: postcss.Declaration,
    selector: string,
    source: string,
    specificity: ReturnType<typeof calculate>,
    inline = false,
  ) => {
    const property = decl.prop.startsWith("--")
      ? decl.prop
      : decl.prop.toLowerCase();
    if (!relevant(property) || decl.value.length > 4096) return;
    if (++applications > 25_000) {
      notes.add(limitNote);
      return;
    }
    const key = property === "background-color" ? "background" : property;
    const candidate: Winner = {
      property,
      value: decl.value,
      selector,
      source,
      kind: kind(node),
      important: !!decl.important,
      inline,
      specificity,
      order: order++,
    };
    const current = declarations.get(node)!.get(key);
    if (
      !current ||
      Number(candidate.important) > Number(current.important) ||
      (candidate.important === current.important &&
        (Number(candidate.inline) > Number(current.inline) ||
          (candidate.inline === current.inline &&
            (compare(candidate.specificity, current.specificity) > 0 ||
              (compare(candidate.specificity, current.specificity) === 0 &&
                candidate.order > current.order)))))
    ) {
      declarations.get(node)!.set(key, candidate);
    }
  };
  const sheetUrls = linkedStylesheetUrls(html, url);
  const linked = new Map(
    sheets.map((sheet, i) =>
      typeof sheet === "string"
        ? [sheetUrls[i], sheet]
        : [sheet.url, sheet.css],
    ),
  );
  function read(css: string, source: string) {
    let root: postcss.Root;
    try {
      root = postcss.parse(css);
    } catch {
      notes.add("A stylesheet contained invalid CSS and was skipped.");
      return;
    }
    root.walkRules((rule) => {
      if (++ruleCount > 2000) {
        notes.add(limitNote);
        return;
      }
      for (
        let parent = rule.parent;
        parent && parent.type !== "root";
        parent = parent.parent
      ) {
        if (
          parent.type === "atrule" &&
          parent.name === "media" &&
          universalMedia(parent.params)
        )
          continue;
        notes.add(conditionalNote);
        return;
      }
      const properties = rule.nodes.filter(
        (node): node is postcss.Declaration =>
          node.type === "decl" &&
          relevant(
            node.prop.startsWith("--") ? node.prop : node.prop.toLowerCase(),
          ),
      );
      if (!properties.length) return;
      for (const selector of postcss.list.comma(rule.selector)) {
        if (++selectorCount > 2000) {
          notes.add(limitNote);
          break;
        }
        if (
          selector.length > 512 ||
          /::|:(?:hover|active|focus(?:-visible|-within)?|visited|target)\b/i.test(
            selector,
          )
        ) {
          notes.add(conditionalNote);
          continue;
        }
        try {
          const specificity = calculate(selector);
          for (const node of nodes) {
            if (!$(node).is(selector)) continue;
            for (const decl of properties)
              write(node, decl, selector, source, specificity);
          }
        } catch {
          notes.add(
            "Some unsupported selectors were skipped rather than guessed.",
          );
        }
      }
    });
  }
  let embedded = 0;
  $("link[rel][href],style").each((_, element) => {
    const tag = $(element);
    if (tag.is("style")) {
      if (universalMedia(tag.attr("media") ?? ""))
        read(tag.text(), `Page styles ${++embedded}`);
      else notes.add(conditionalNote);
    } else {
      if (!universalMedia(tag.attr("media") ?? "")) notes.add(conditionalNote);
      try {
        const href = publicUrl(tag.attr("href")!, url).href;
        const css = linked.get(href);
        if (
          css !== undefined &&
          tag.attr("rel")?.toLowerCase().split(/\s+/).includes("stylesheet") &&
          !tag.is("[disabled]") &&
          universalMedia(tag.attr("media") ?? "")
        )
          read(css, `Linked CSS: ${new URL(href).pathname.slice(-110)}`);
      } catch {
        /* Unsupported URL. */
      }
    }
  });
  for (const node of nodes) {
    const inline = $(node).attr("style");
    if (!inline) continue;
    try {
      const rule = postcss.parse(`x{${inline}}`).first;
      if (rule?.type === "rule")
        rule.each((decl) => {
          if (decl.type === "decl")
            write(
              node,
              decl,
              `${node.tagName}${node.attribs.id ? `#${node.attribs.id}` : ""} [inline]`,
              "Inline style",
              { A: 0, B: 0, C: 0 },
              true,
            );
        });
    } catch {
      notes.add("An invalid inline style was skipped.");
    }
  }
  const computed = new Map<Node, Map<string, StyleObservation>>();
  function compute(node: Node): Map<string, StyleObservation> {
    if (computed.has(node)) return computed.get(node)!;
    const parent = $(node).parent()[0];
    const inherited =
      parent && declarations.has(parent)
        ? compute(parent)
        : new Map<string, StyleObservation>();
    const own = declarations.get(node)!;
    const result = new Map(
      [...inherited].filter(
        ([prop]) =>
          prop.startsWith("--") ||
          /^(?:font-family|color|visibility)$/.test(prop),
      ),
    );
    const invalid = new Set<string>();
    const resolved = new Map<string, string | null>();
    function variable(name: string, chain: string[]): string | null {
      if (chain.includes(name)) {
        for (const item of chain.slice(chain.indexOf(name))) invalid.add(item);
        return null;
      }
      if (resolved.has(name)) return resolved.get(name)!;
      const candidate = own.get(name);
      const value =
        !candidate || /^(?:inherit|unset)$/.test(candidate.value.trim())
          ? (inherited.get(name)?.value ?? null)
          : candidate.value.trim() === "initial"
            ? null
            : resolve(candidate.value, [...chain, name]);
      const final = invalid.has(name) ? null : value;
      resolved.set(name, final);
      return final;
    }
    function resolve(value: string, chain: string[]): string | null {
      if (chain.length > 16) return null;
      function render(
        parts: ReturnType<typeof valueParser>["nodes"],
        depth = 0,
      ): string | null {
        if (depth > 16) return null;
        let output = "";
        for (const part of parts) {
          if (part.type !== "function") {
            output += valueParser.stringify(part);
            if (output.length > 8192) return null;
            continue;
          }
          if (part.value.toLowerCase() === "var") {
            const comma = part.nodes.findIndex(
              (n) => n.type === "div" && n.value === ",",
            );
            const name = valueParser
              .stringify(comma < 0 ? part.nodes : part.nodes.slice(0, comma))
              .trim();
            if (!/^--[\w-]+$/.test(name)) return null;
            const replacement =
              variable(name, chain) ??
              (comma < 0
                ? null
                : render(part.nodes.slice(comma + 1), depth + 1));
            if (replacement === null) return null;
            output += replacement;
          } else {
            const inner = render(part.nodes, depth + 1);
            if (inner === null) return null;
            output += `${part.value}(${inner})`;
          }
          if (output.length > 8192) return null;
        }
        return output;
      }
      return render(valueParser(value).nodes);
    }
    for (const [key, candidate] of own) {
      const value = key.startsWith("--")
        ? variable(key, [])
        : resolve(candidate.value, []);
      if (value === null) {
        if (key.startsWith("--")) result.delete(key);
        notes.add(
          "Unresolved or cyclic custom properties are skipped; CSS variables are resolved within their sampled element’s inherited scope.",
        );
      } else if (
        value.trim() === "inherit" ||
        (value.trim() === "unset" &&
          /^(?:font-family|color|visibility)$/.test(key))
      ) {
        const fallback = inherited.get(key);
        if (fallback) result.set(key, fallback);
        else result.delete(key);
      } else result.set(key, { ...candidate, value });
    }
    computed.set(node, result);
    return result;
  }
  const observations: StyleObservation[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const values = compute(node);
    const hidden = [node, ...$(node).parents().toArray()].some((parent) => {
      const styles = computed.get(parent);
      return (
        styles?.get("display")?.value.trim() === "none" ||
        /^(?:hidden|collapse)$/.test(
          styles?.get("visibility")?.value.trim() ?? "",
        )
      );
    });
    if (hidden) continue;
    for (const [key, entry] of values) {
      const isToken = key.startsWith("--");
      if (isToken && !$(node).is("html,body")) continue;
      if (
        !isToken &&
        !declarations.get(node)!.has(key) &&
        !(key === "font-family" && kind(node) === "heading")
      )
        continue;
      const observation = {
        ...entry,
        kind: isToken ? ("token" as const) : kind(node),
      };
      const signature = [
        entry.source,
        entry.selector,
        key,
        entry.value,
        observation.kind,
      ].join("\0");
      if (!seen.has(signature)) {
        observations.push(observation);
        seen.add(signature);
      }
    }
  }
  notes.add(
    "Matched static selectors use source order, specificity, inline priority, and !important. This is a sample, not computed browser styles.",
  );
  return { observations, notes: [...notes] };
}
