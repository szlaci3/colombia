import { load } from "cheerio";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import Color from "colorjs.io";
import {
  luminance,
  readablePalette,
  styleImportSchema,
  type StyleImport,
} from "../src/theme.ts";
import { ImportError, publicUrl, fetchPublicText } from "./public-fetch.ts";

export function parseColor(value: string): string | null {
  try {
    const color = new Color(value);
    if (color.alpha < 0.99) return null;
    return (
      "#" +
      color
        .to("srgb")
        .coords.map((channel) =>
          Math.round(Math.min(1, Math.max(0, channel ?? 0)) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  } catch {
    return null;
  }
}
export function stylesheetUrls(html: string, url: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $("link[rel][href]").each((_, element) => {
    if (
      !($(element).attr("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("stylesheet")
    )
      return;
    try {
      urls.add(publicUrl($(element).attr("href")!, url).href);
    } catch {
      /* Unfetchable links contribute no styles. */
    }
  });
  return [...urls].slice(0, 3);
}

export function extractStyle(
  html: string,
  url: string,
  sheets: string[],
): StyleImport {
  const $ = load(html);
  const title = (
    $('meta[property="og:site_name"]').attr("content") ||
    $("title").first().text() ||
    new URL(url).hostname
  )
    .trim()
    .slice(0, 120);
  const styles = [...sheets];
  $("style").each((_, el) => {
    styles.push($(el).text());
  });
  $("[style]").each((_, el) => {
    const name = el.tagName;
    styles.push(
      `${/^[a-z][a-z0-9-]*$/i.test(name) ? name : "div"}{${$(el).attr("style")}}`,
    );
  });
  const roots: ReturnType<typeof postcss.parse>[] = [];
  for (const css of styles) {
    try {
      roots.push(postcss.parse(css));
    } catch {
      /* Invalid sheets are skipped rather than guessed. */
    }
  }
  const variables = new Map<string, string>();
  for (const root of roots)
    root.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) variables.set(decl.prop, decl.value);
    });
  function resolve(value: string, depth = 0): string {
    if (depth > 8) return "";
    return value.replace(
      /var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,
      (_, key: string, fallback: string) =>
        resolve(variables.get(key) ?? fallback ?? "", depth + 1),
    );
  }
  const colors = new Map<
    string,
    { score: number; accent: number; surface: number; ink: number }
  >();
  function add(
    color: string | null,
    score: number,
    role?: "accent" | "surface" | "ink",
  ) {
    if (!color) return;
    const entry = colors.get(color) ?? {
      score: 0,
      accent: 0,
      surface: 0,
      ink: 0,
    };
    entry.score += score;
    if (role) entry[role] += score;
    colors.set(color, entry);
  }
  const metaColor = parseColor(
    $('meta[name="theme-color"]').attr("content") ?? "",
  );
  add(metaColor, 10, "accent");
  let fontName = "";
  let fontScore = -1;
  const radii: number[] = [];
  for (const root of roots)
    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const value = resolve(decl.value);
      const selector =
        decl.parent?.type === "rule"
          ? (decl.parent as postcss.Rule).selector
          : "";
      if (
        prop === "font-family" ||
        /--.*font.*(?:heading|display|family|sans|serif)/.test(prop)
      ) {
        const score = /h1|h2|heading|display/.test(selector + prop)
          ? 5
          : /body|html|:root/.test(selector)
            ? 3
            : 1;
        const first = value
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (score > fontScore && first && !/var\(|url\(|[{};]/.test(first)) {
          fontName = first.slice(0, 120);
          fontScore = score;
        }
      }
      if (prop === "border-radius" || /--.*radius/.test(prop)) {
        const radius = value.match(/^(\d*\.?\d+)(px|rem)?$/);
        if (radius)
          radii.push(
            Math.min(
              24,
              Math.round(Number(radius[1]) * (radius[2] === "rem" ? 16 : 1)),
            ),
          );
      }
      if (
        !/color|background|^--/.test(prop) ||
        /font|radius|shadow|spacing|size/.test(prop)
      )
        return;
      let role: "accent" | "surface" | "ink" | undefined;
      let score = 1;
      if (
        /primary|accent|brand/.test(prop) &&
        !/foreground|text|contrast/.test(prop)
      ) {
        role = "accent";
        score = 8;
      } else if (
        /background/.test(prop) &&
        /(?:^|[\s,])(?:html|body)(?:$|[\s,.#:]|\[)/.test(selector)
      ) {
        role = "surface";
        score = 8;
      } else if (
        (prop === "color" && /html|body/.test(selector)) ||
        /--.*(?:text|foreground|ink)/.test(prop)
      ) {
        role = "ink";
        score = 5;
      } else if (
        /button|\.btn|\.cta/.test(selector) &&
        /background/.test(prop)
      ) {
        role = "accent";
        score = 6;
      } else if (/--.*(?:surface|background|bg)$/.test(prop)) {
        role = "surface";
        score = 5;
      }
      const direct = parseColor(value);
      if (direct) {
        add(direct, score, role);
        return;
      }
      valueParser(value).walk((node) => {
        if (node.type === "function") {
          add(parseColor(valueParser.stringify(node)), score, role);
          return false;
        }
        if (node.type === "word") add(parseColor(node.value), score, role);
      });
    });
  if (!colors.size)
    throw new ImportError(
      "No usable colors were found in this page’s static HTML or CSS. Try another page or use a curated theme.",
    );
  const ranked = [...colors.entries()].sort((a, b) => b[1].score - a[1].score);
  const accentRank = [...ranked].sort(
    (a, b) => b[1].accent - a[1].accent || b[1].score - a[1].score,
  );
  const chromatic = accentRank.filter(([hex]) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...channels) - Math.min(...channels) > 24;
  });
  const accent = (chromatic[0] ?? accentRank[0])[0];
  const surfaceCandidates = [...ranked].sort(
    (a, b) => b[1].surface - a[1].surface,
  );
  const surface =
    surfaceCandidates.find(
      ([hex, info]) => info.surface > 0 && luminance(hex) > 0.65,
    )?.[0] ??
    surfaceCandidates.find(([, info]) => info.surface > 0)?.[0] ??
    "#fafaf7";
  const ink =
    [...ranked]
      .sort((a, b) => b[1].ink - a[1].ink)
      .find(([hex]) => luminance(hex) < 0.2)?.[0] ?? "#252b24";
  const readable = readablePalette(accent, surface, ink);
  const notes = [...readable.notes];
  if (surface === "#fafaf7" && !colors.has(surface))
    notes.push(
      "No light page background was detected; a neutral background is used.",
    );
  notes.push(
    fontName
      ? `Detected “${fontName}”. The prototype uses a local ${/serif|georgia|times|garamond|baskerville|playfair|lora|merriweather/i.test(fontName) && !/sans/i.test(fontName) ? "serif" : "sans-serif"} fallback; no source fonts are downloaded.`
      : "No heading font was detected; a local sans-serif fallback is used.",
  );
  notes.push(
    "This is static HTML/CSS analysis, not a rendered browser capture. Script-generated styles, CSS imports, images, spacing, and shadows are not reproduced.",
  );
  if (!radii.length)
    notes.push(
      "No simple corner radius was found; an 8px starting point is used.",
    );
  return styleImportSchema.parse({
    palette: readable.palette,
    source: { url, title, fontName },
    font:
      /serif|georgia|times|garamond|baskerville|playfair|lora|merriweather/i.test(
        fontName,
      ) && !/sans/i.test(fontName)
        ? "serif"
        : "sans",
    radius: radii.length
      ? [...radii].sort((a, b) => a - b)[Math.floor(radii.length / 2)]
      : 8,
    colors: [...new Set([accent, ...ranked.map(([hex]) => hex)])].slice(0, 8),
    notes,
    stylesheetCount: sheets.length,
  });
}

export async function importWebsite(
  value: string,
  signal: AbortSignal,
  fetchText = fetchPublicText,
): Promise<StyleImport> {
  const page = await fetchText(publicUrl(value).href, "html", signal);
  const notes: string[] = [];
  const sheets = await Promise.all(
    stylesheetUrls(page.text, page.url).map(async (url) => {
      try {
        return (await fetchText(url, "css", signal)).text;
      } catch {
        notes.push(
          "A linked stylesheet could not be read; the result may be incomplete.",
        );
        return null;
      }
    }),
  );
  signal.throwIfAborted();
  const result = extractStyle(
    page.text,
    page.url,
    sheets.filter((sheet): sheet is string => sheet !== null),
  );
  result.notes = [...result.notes, ...new Set(notes)];
  return result;
}
