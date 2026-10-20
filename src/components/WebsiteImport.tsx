import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { ContentImport } from "./ContentImport";
import type { ContentSection } from "../content";
import {
  paletteProblems,
  styleImportSchema,
  type Palette,
  type StyleImport as Result,
} from "../theme";

const colorNames: Record<keyof Palette, string> = {
  accent: "Accent",
  surface: "Page",
  ink: "Text",
  soft: "Soft background",
};
export function WebsiteImport({
  close,
  apply,
  content,
}: {
  close: () => void;
  apply: (result: Result, brand: string | null) => void;
  content: {
    slots: number;
    destination: string;
    apply: (sections: ContentSection[]) => void;
  };
}) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"style" | "content">("style");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [rename, setRename] = useState(false);
  const [brand, setBrand] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/import-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(16_000),
        ]),
      });
      if (response.status === 429)
        throw new Error(
          "A few too many imports. Wait a minute, then try again.",
        );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "Style import isn’t available on this deployment. You can still use a curated theme.",
        );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "This website could not be analyzed. Try another page.",
        );
      const validated = styleImportSchema.safeParse(data);
      if (!validated.success)
        throw new Error(
          "The website returned an unsupported style result. Your project is unchanged.",
        );
      if (controller.signal.aborted) return;
      setResult(validated.data);
      setBrand(validated.data.source.title.split(/\s[|—–-]\s/)[0].slice(0, 40));
      setRename(false);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error && failure.name !== "TimeoutError"
            ? failure.message
            : "This website took too long to analyze. Try another public page.",
        );
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  const problems = result ? paletteProblems(result.palette) : [];
  return (
    <Dialog title="Your website, a new possibility." close={close} wide>
      <div
        className="website-import-tabs"
        role="group"
        aria-label="Website import mode"
      >
        <button
          className={mode === "style" ? "active" : ""}
          aria-pressed={mode === "style"}
          onClick={() => setMode("style")}
        >
          Visual style
        </button>
        <button
          className={mode === "content" ? "active" : ""}
          aria-pressed={mode === "content"}
          onClick={() => {
            request.current?.abort();
            setBusy(false);
            setMode("content");
          }}
        >
          Page content
        </button>
      </div>
      {mode === "content" ? (
        <ContentImport url={url} setUrl={setUrl} {...content} />
      ) : (
        <>
          <p className="dialog-description">
            Bring a website’s visual style into your prototypes. We read its
            public HTML and CSS, then you review what we found.
          </p>
          <form
            onSubmit={(event) => void analyze(event)}
            className="style-import-form"
          >
            <label htmlFor="website-url">Website URL</label>
            <div>
              <input
                id="website-url"
                type="url"
                required
                maxLength={2000}
                placeholder="https://your-company.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
              <button className="button dark" disabled={busy} type="submit">
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Search size={15} />
                )}{" "}
                {busy ? "Reading styles…" : "Explore style"}
              </button>
            </div>
            <p>
              Public HTTPS pages only. No login, screenshots, or source scripts
              are used.
            </p>
          </form>
          {busy && (
            <div className="import-progress" role="status">
              <Sparkles size={18} />
              <div>
                <strong>Finding the familiar details.</strong>
                <span>
                  Reading the page and up to three stylesheets. This may take a
                  few seconds.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  request.current?.abort();
                  setBusy(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="style-review">
              <div className="style-source">
                <span className="panel-eyebrow">
                  REVIEW YOUR STARTING POINT
                </span>
                <h3>{result.source.title}</h3>
                <a href={result.source.url} target="_blank" rel="noreferrer">
                  {new URL(result.source.url).hostname}{" "}
                  <ExternalLink size={11} />
                </a>
              </div>
              <div className="detected-colors">
                <span>Detected colors</span>
                <div>
                  {result.colors.map((color) => (
                    <span
                      key={color}
                      title={color}
                      style={{ background: color }}
                    >
                      <span className="sr-only">{color}</span>
                    </span>
                  ))}
                </div>
                <small>
                  {result.stylesheetCount} linked stylesheet
                  {result.stylesheetCount === 1 ? "" : "s"} read
                </small>
              </div>
              <div className="palette-review">
                {(Object.keys(colorNames) as (keyof Palette)[]).map((key) => (
                  <label key={key}>
                    <span>{colorNames[key]}</span>
                    <div>
                      <input
                        type="color"
                        aria-label={`${colorNames[key]} color`}
                        value={result.palette[key]}
                        onChange={(event) =>
                          setResult({
                            ...result,
                            palette: {
                              ...result.palette,
                              [key]: event.target.value,
                            },
                          })
                        }
                      />
                      <code>{result.palette[key]}</code>
                    </div>
                  </label>
                ))}
              </div>
              <div
                className="style-sample"
                style={{
                  background: result.palette.surface,
                  color: result.palette.ink,
                  borderRadius: result.radius,
                }}
              >
                <div>
                  <span style={{ color: result.palette.accent }}>
                    A LITTLE POSSIBILITY
                  </span>
                  <h3
                    style={{
                      fontFamily:
                        result.font === "serif"
                          ? "Georgia, serif"
                          : "Arial, sans-serif",
                    }}
                  >
                    A familiar feeling.
                    <br />A fresh perspective.
                  </h3>
                  <p>Your content stays. Your visual identity follows.</p>
                </div>
                <span
                  className="sample-button"
                  style={{
                    background: result.palette.accent,
                    color: "#fff",
                    borderRadius: result.radius,
                  }}
                >
                  Made for you <ArrowRight size={14} />
                </span>
              </div>
              <div className="style-details">
                <label>
                  Heading style
                  <select
                    aria-label="Imported heading style"
                    value={result.font}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        font: event.target.value as "serif" | "sans",
                      })
                    }
                  >
                    <option value="serif">Editorial serif</option>
                    <option value="sans">Modern sans</option>
                  </select>
                </label>
                <label>
                  Corners <span>{result.radius}px</span>
                  <input
                    aria-label="Imported corner radius"
                    type="range"
                    min="0"
                    max="24"
                    value={result.radius}
                    onChange={(event) =>
                      setResult({
                        ...result,
                        radius: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="rename-import">
                <label>
                  <input
                    type="checkbox"
                    checked={rename}
                    onChange={(event) => setRename(event.target.checked)}
                  />{" "}
                  Also change the brand name
                </label>
                {rename && (
                  <input
                    aria-label="Imported brand name"
                    maxLength={40}
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                  />
                )}
              </div>
              <details className="import-notes">
                <summary>What was detected and adapted</summary>
                <ul>
                  {result.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </details>
              {problems.length > 0 && (
                <div className="import-error" role="alert">
                  <ul>
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="import-apply">
                <span>
                  <Check size={14} /> All 3 templates. One undoable change.
                </span>
                <button
                  className="button dark"
                  disabled={problems.length > 0 || (rename && !brand.trim())}
                  onClick={() => apply(result, rename ? brand.trim() : null)}
                >
                  Apply to all templates <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
