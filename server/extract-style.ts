import { load } from "cheerio";
import valueParser from "postcss-value-parser";
import Color from "colorjs.io";
import {
  luminance,
  readablePalette,
  styleImportSchema,
  type StyleImport,
  type StyleEvidence,
} from "../src/theme.ts";
import { ImportError, publicUrl, fetchPublicText } from "./public-fetch.ts";
import {
  collectStyleObservations,
  linkedStylesheetUrls,
  type LinkedStylesheet,
  type StyleObservation,
} from "./style-cascade.ts";

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
  return linkedStylesheetUrls(html, url);
}

export function extractStyle(
  html: string,
  url: string,
  sheets: (string | LinkedStylesheet)[],
): StyleImport {
  const $ = load(html);
  const title = (
    $('meta[property="og:site_name"]').attr("content") ||
    $("title").first().text() ||
    new URL(url).hostname
  )
    .trim()
    .slice(0, 120);
  const sample = collectStyleObservations(html, url, sheets);
  const colors = new Map<
    string,
    {
      score: number;
      accent: number;
      surface: number;
      ink: number;
      evidence: StyleObservation;
    }
  >();
  const proofs: {
    color: string;
    score: number;
    evidence: StyleObservation;
    role?: "accent" | "surface" | "ink";
  }[] = [];
  function add(
    color: string | null,
    score: number,
    evidence: StyleObservation,
    role?: "accent" | "surface" | "ink",
  ) {
    if (!color) return;
    proofs.push({ color, score, evidence, role });
    const entry = colors.get(color) ?? {
      score: 0,
      accent: 0,
      surface: 0,
      ink: 0,
      evidence,
    };
    entry.score += score;
    if (role) entry[role] += score;
    colors.set(color, entry);
  }
  const metaColor = parseColor(
    $('meta[name="theme-color"]').attr("content") ?? "",
  );
  add(
    metaColor,
    6,
    {
      property: "theme-color",
      value: metaColor ?? "",
      selector: 'meta[name="theme-color"]',
      source: "Page metadata",
      kind: "other",
    },
    "accent",
  );
  let fontName = "";
  let fontScore = -1;
  let fontEvidence: StyleObservation | undefined;
  const radii: { radius: number; evidence: StyleObservation; score: number }[] =
    [];
  for (const observation of sample.observations) {
    const prop = observation.property.toLowerCase();
    const value = observation.value;
    if (
      prop === "font-family" ||
      /--.*font.*(?:heading|display|family|sans|serif)/.test(prop)
    ) {
      const score =
        observation.kind === "heading"
          ? 10
          : prop.startsWith("--") && /heading|display/.test(prop)
            ? 5
            : observation.kind === "page"
              ? 3
              : 1;
      const first = value
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (score > fontScore && first && !/var\(|url\(|[{};]/.test(first)) {
        fontName = first.slice(0, 120);
        fontScore = score;
        fontEvidence = observation;
      }
    }
    if (prop === "border-radius" || /--.*radius/.test(prop)) {
      const radius = value.match(/^(\d*\.?\d+)(px|rem)?$/);
      if (radius)
        radii.push({
          radius: Math.min(
            24,
            Math.round(Number(radius[1]) * (radius[2] === "rem" ? 16 : 1)),
          ),
          evidence: observation,
          score:
            observation.kind === "action"
              ? 3
              : observation.kind === "token"
                ? 1
                : 2,
        });
    }
    if (
      !/color|background|^--/.test(prop) ||
      /font|radius|shadow|spacing|size/.test(prop)
    )
      continue;
    let role: "accent" | "surface" | "ink" | undefined;
    let score = 1;
    if (observation.kind === "action" && /background|^color$/.test(prop)) {
      role = "accent";
      score = /background/.test(prop) ? 20 : 12;
    } else if (
      /primary|accent|brand/.test(prop) &&
      !/foreground|text|contrast/.test(prop)
    ) {
      role = "accent";
      score = 8;
    } else if (/background/.test(prop) && observation.kind === "page") {
      role = "surface";
      score = 8;
    } else if (
      (prop === "color" && observation.kind === "page") ||
      /--.*(?:text|foreground|ink)/.test(prop)
    ) {
      role = "ink";
      score = 5;
    } else if (/--.*(?:surface|background|bg)$/.test(prop)) {
      role = "surface";
      score = 5;
    }
    const direct = parseColor(value);
    if (direct) {
      add(direct, score, observation, role);
      continue;
    }
    valueParser(value).walk((node) => {
      if (node.type === "function") {
        add(parseColor(valueParser.stringify(node)), score, observation, role);
        return false;
      }
      if (node.type === "word")
        add(parseColor(node.value), score, observation, role);
    });
  }
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
  const strongestRadii = radii
    .filter(
      (item) => item.score === Math.max(...radii.map((item) => item.score)),
    )
    .sort((a, b) => a.radius - b.radius);
  const corner = strongestRadii[Math.floor(strongestRadii.length / 2)];
  function evidence(
    role: StyleEvidence["role"],
    value: string,
    observation?: StyleObservation,
  ): StyleEvidence {
    return {
      role,
      value: value.slice(0, 200),
      selector: observation?.selector.slice(0, 200) ?? "",
      property: observation?.property.slice(0, 80) ?? "",
      source: observation?.source.slice(0, 160) ?? "Formlane fallback",
      basis: !observation
        ? "fallback"
        : observation.property === "theme-color"
          ? "metadata"
          : observation.kind === "token"
            ? "token"
            : "matched",
    };
  }
  function colorEvidence(role: "accent" | "surface" | "ink", color: string) {
    const proof = proofs
      .filter((item) => item.color === color)
      .sort(
        (a, b) =>
          Number(b.role === role) - Number(a.role === role) ||
          b.score - a.score,
      )[0];
    return evidence(role, color, proof?.evidence);
  }
  return styleImportSchema.parse({
    palette: readable.palette,
    source: { url, title, fontName },
    font:
      /serif|georgia|times|garamond|baskerville|playfair|lora|merriweather/i.test(
        fontName,
      ) && !/sans/i.test(fontName)
        ? "serif"
        : "sans",
    radius: corner?.radius ?? 8,
    colors: [...new Set([accent, ...ranked.map(([hex]) => hex)])].slice(0, 8),
    notes: [...new Set([...sample.notes, ...notes])].slice(0, 11),
    stylesheetCount: sheets.length,
    evidence: [
      colorEvidence("accent", accent),
      colorEvidence("surface", surface),
      colorEvidence("ink", ink),
      evidence("font", fontName || "Local sans-serif", fontEvidence),
      evidence("radius", `${corner?.radius ?? 8}px`, corner?.evidence),
    ],
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
        return { url, css: (await fetchText(url, "css", signal)).text };
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
    sheets.filter((sheet): sheet is LinkedStylesheet => sheet !== null),
  );
  result.notes = [...result.notes, ...new Set(notes)];
  return result;
}
