import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  collectStyleObservations,
  linkedStylesheetUrls,
} from "./style-cascade.ts";
import { extractStyle, importWebsite } from "./extract-style.ts";
import { paletteProblems, styleImportSchema } from "../src/theme.ts";

const url = "https://example.com/";
const observe = (
  css: string,
  body = '<h1>Welcome</h1><button id="go" class="action">Explore</button>',
) =>
  collectStyleObservations(`<style>${css}</style>${body}`, url, [])
    .observations;
const action = (css: string) =>
  observe(css).find(
    (item) => item.kind === "action" && /background/.test(item.property),
  );

describe("bounded static CSS cascade", () => {
  it("uses only selectors matching sampled elements, including comma lists", () => {
    const result = observe(
      "body{color:#222222}.unused{background:red;--brand-primary:red}button,.missing{background:#663399}",
    );
    expect(result.find((item) => item.kind === "action")?.value).toBe(
      "#663399",
    );
    expect(result.some((item) => item.value === "red")).toBe(false);
  });
  it("resolves specificity, source order, selector-list branches and modern selector specificity", () => {
    expect(
      action(
        "#go{background:#663399}.action{background:red}button{background:blue}",
      )?.value,
    ).toBe("#663399");
    expect(
      action(".action{background:red}.action{background:#663399}")?.value,
    ).toBe("#663399");
    expect(
      action(
        ":where(#go){background:red}:is(.missing,.action){background:#663399}button{background:blue}",
      )?.value,
    ).toBe("#663399");
    expect(
      action("#absent,button{background:red}.action{background:#663399}")
        ?.value,
    ).toBe("#663399");
  });
  it("keeps inline styles attached to their element and respects important priority", () => {
    const html =
      '<style>button{background:red!important}</style><button style="background:#663399!important">A</button><button style="background:blue">B</button>';
    const result = collectStyleObservations(html, url, []).observations.filter(
      (item) => item.kind === "action",
    );
    expect(result.map((item) => item.value)).toEqual(["#663399", "red"]);
    expect(result[0].source).toBe("Inline style");
  });
  it("compares background shorthand and color longhand in one cascade slot", () => {
    expect(
      action("button{background-color:red;background:#663399}")?.value,
    ).toBe("#663399");
    expect(
      action("button{background:red!important;background-color:blue}")?.value,
    ).toBe("red");
  });
  it("preserves document order across embedded and linked sheets, including failed sheet positions", () => {
    const html =
      '<style>button{background:red}</style><link rel="stylesheet" href="/one.css"><style>button{background:blue}</style><link rel="stylesheet" href="/two.css"><button>Go</button>';
    const result = collectStyleObservations(html, url, [
      { url: `${url}two.css`, css: "button{background:#663399}" },
    ]);
    expect(
      result.observations.find((item) => item.kind === "action")?.value,
    ).toBe("#663399");
    expect(
      result.observations.find((item) => item.kind === "action")?.source,
    ).toContain("two.css");
  });
  it("inherits scoped and case-sensitive custom properties without leaking sibling overrides", () => {
    const result = observe(
      ":root{--Brand:#663399;--alias:var(--Brand)}.sidebar{--Brand:red}.content{--Brand:blue}button{background:var(--alias)}",
      '<aside class="sidebar">Other</aside><main class="content"><button>Go</button></main>',
    );
    expect(result.find((item) => item.kind === "action")?.value).toBe(
      "#663399",
    );
    expect(result.some((item) => item.value === "red")).toBe(false);
    expect(
      action(
        ":root{--brand:red;--Brand:#663399}button{background:var(--Brand)}",
      )?.value,
    ).toBe("#663399");
  });
  it("resolves nested fallbacks, functions, important variables, and cycles safely", () => {
    expect(
      action(
        ":root{--brand:#663399!important;--brand:red}button{background:var(--brand)}",
      )?.value,
    ).toBe("#663399");
    expect(
      action(
        "button{background:var(--missing,var(--also-missing,rgb(20,40,60)))}",
      )?.value,
    ).toBe("rgb(20,40,60)");
    expect(
      action(
        ":root{--a:var(--b);--b:var(--a)}button{background:var(--a,#663399)}",
      )?.value,
    ).toBe("#663399");
    expect(
      action(":root{--a:var(--a,red)}button{background:var(--a,#663399)}")
        ?.value,
    ).toBe("#663399");
  });
  it("bounds nested variable expansion and skips unresolved values", () => {
    const css = Array.from(
      { length: 12 },
      (_, i) => `--v${i}:var(--v${i + 1}) var(--v${i + 1});`,
    ).join("");
    const result = observe(
      `:root{${css}--v12:${"red ".repeat(100)}}button{background:var(--v0)}`,
    );
    expect(result.some((item) => item.value.length > 8192)).toBe(false);
    expect(result.some((item) => item.kind === "action")).toBe(false);
  });
  it("omits hidden content, conditional rules, interactive states, layers and unsupported selectors with notes", () => {
    const result = collectStyleObservations(
      '<style>button{background:#663399}.hidden{display:none}.hidden button{background:red}button:hover{background:orange}@media(prefers-color-scheme:dark){button{background:black}}@layer other{button{background:pink}}button:made-up{background:yellow}</style><button>Go</button><div class="hidden"><button>Hidden</button></div><div hidden><button>Also hidden</button></div>',
      url,
      [],
    );
    expect(
      result.observations
        .filter((item) => item.kind === "action")
        .map((item) => item.value),
    ).toEqual(["#663399"]);
    expect(result.notes.join(" ")).toMatch(/Conditional/);
    expect(result.notes.join(" ")).toMatch(/unsupported selectors/);
  });
  it("limits rule sampling and identifies omitted styles", () => {
    const css =
      "button{background:#663399}" +
      ".unused{color:red}".repeat(2000) +
      "button{background:blue}";
    const result = collectStyleObservations(
      `<style>${css}</style><button>Go</button>`,
      url,
      [],
    );
    expect(
      result.observations.find((item) => item.kind === "action")?.value,
    ).toBe("#663399");
    expect(result.notes.join(" ")).toMatch(/2,000 rules/);
  });
  it("does not fetch disabled or conditional stylesheets", () => {
    expect(
      linkedStylesheetUrls(
        '<link rel="stylesheet" href="/print.css" media="print"><link rel="stylesheet" href="/dark.css" media="(prefers-color-scheme:dark)"><link rel="stylesheet" href="/off.css" disabled><link rel="stylesheet" href="/main.css" media="screen">',
        url,
      ),
    ).toEqual([`${url}main.css`]);
  });
});

describe("review evidence", () => {
  const html = readFileSync(
    new URL("../public/examples/brand-study.html", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../public/examples/brand-study.css", import.meta.url),
    "utf8",
  );
  it("traces original example choices to matched selectors and keeps a readable adapted palette", () => {
    const result = extractStyle(html, url, [
      { url: `${url}examples/brand-study.css`, css },
    ]);
    expect(result.palette.accent).toBe("#663399");
    expect(result.palette.surface).toBe("#ffffff");
    expect(result.source.fontName).toBe("Georgia");
    expect(result.radius).toBe(12);
    expect(result.colors).not.toContain("#ff0000");
    expect(result.colors).not.toContain("#ff8800");
    expect(
      result.evidence?.find((item) => item.role === "accent"),
    ).toMatchObject({
      selector: "#explore",
      basis: "matched",
      value: "#663399",
    });
    expect(
      result.evidence?.find((item) => item.role === "surface")?.source,
    ).toContain("brand-study.css");
    expect(paletteProblems(result.palette)).toEqual([]);
  });
  it("separates detected source colors from adapted proposals and labels fallbacks", () => {
    const result = extractStyle(
      "<style>button{background:#ffea00}</style><button>Go</button>",
      url,
      [],
    );
    expect(result.palette.accent).not.toBe("#ffea00");
    expect(result.evidence?.find((item) => item.role === "accent")?.value).toBe(
      "#ffea00",
    );
    expect(result.evidence?.find((item) => item.role === "font")?.basis).toBe(
      "fallback",
    );
    expect(
      result.evidence?.find((item) => item.role === "surface")?.basis,
    ).toBe("fallback");
    expect(
      styleImportSchema.safeParse({
        ...result,
        evidence: [{ ...result.evidence![0], basis: "computed-browser" }],
      }).success,
    ).toBe(false);
  });
  it("preserves linked stylesheet identity when an earlier fetch fails", async () => {
    const result = await importWebsite(
      url,
      AbortSignal.timeout(1000),
      async (target) => {
        if (target === url)
          return {
            url,
            text: '<style>button{background:red}</style><link rel="stylesheet" href="/first.css"><link rel="stylesheet" href="/second.css"><button>Go</button>',
          };
        if (target.endsWith("first.css")) throw new Error("Unavailable");
        return { url: target, text: "button{background:#663399}" };
      },
    );
    expect(result.palette.accent).toBe("#663399");
    expect(
      result.evidence?.find((item) => item.role === "accent")?.source,
    ).toContain("second.css");
    expect(result.notes.join(" ")).toContain("could not be read");
  });
});
