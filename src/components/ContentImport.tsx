import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Search,
  Table2,
} from "lucide-react";
import {
  contentImportSchema,
  type ContentImportResult,
  type ContentSection,
} from "../content";

export function ContentImport({
  url,
  setUrl,
  slots,
  destination,
  apply,
}: {
  url: string;
  setUrl: (url: string) => void;
  slots: number;
  destination: string;
  apply: (sections: ContentSection[]) => void;
}) {
  const [result, setResult] = useState<ContentImportResult | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"sections" | "markdown">("sections");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const markdown = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    setResult(null);
    try {
      const response = await fetch("/api/import-content", {
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
          "Content import isn’t available on this deployment. You can still edit your prototype.",
        );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "This page could not be read. Try another public page.",
        );
      const validated = contentImportSchema.safeParse(data);
      if (!validated.success)
        throw new Error(
          "This page returned unsupported content. Your project is unchanged.",
        );
      if (controller.signal.aborted) return;
      setResult(validated.data);
      setChosen(
        validated.data.sections.slice(0, slots).map((section) => section.id),
      );
      setView("sections");
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error && failure.name !== "TimeoutError"
            ? failure.message
            : "This page took too long to read. Try another public page.",
        );
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const blob = new Blob([result.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      result.source.title
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 70) || "webpage"
    }.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Markdown downloaded. Your prototype is unchanged.");
  }
  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setStatus("Markdown copied.");
    } catch {
      setView("markdown");
      setStatus(
        "Clipboard is unavailable. Select and copy the Markdown below.",
      );
      requestAnimationFrame(() => {
        markdown.current?.focus();
        markdown.current?.select();
      });
    }
  }
  const selected =
    result?.sections.filter((section) => chosen.includes(section.id)) ?? [];
  return (
    <div className="content-import">
      <p className="dialog-description">
        Collect a page’s headings, text, lists, links, and tables. Download
        Markdown, or choose sections to add to your prototype.
      </p>
      <form
        className="style-import-form"
        onSubmit={(event) => void analyze(event)}
      >
        <label htmlFor="content-url">Content website URL</label>
        <div>
          <input
            id="content-url"
            type="url"
            required
            maxLength={2000}
            placeholder="https://your-company.com/about"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy}
          />
          <button className="button dark" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Search size={15} />
            )}{" "}
            {busy ? "Reading content…" : "Read page"}
          </button>
        </div>
        <p>
          Public HTTPS pages only. Content is read without executing scripts or
          using your login.
        </p>
        <button
          className="content-example"
          type="button"
          disabled={busy}
          onClick={() =>
            setUrl("https://formlane.netlify.app/examples/studio-notes.html")
          }
        >
          Try the studio notes example
        </button>
      </form>
      {busy && (
        <div className="import-progress" role="status">
          <FileText size={18} />
          <div>
            <strong>Making a little room for the story.</strong>
            <span>
              Reading the page’s main content and preparing editable sections.
            </span>
          </div>
          <button
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
            <span className="panel-eyebrow">REVIEW THE CONTENT</span>
            <h3>{result.source.title}</h3>
            <a href={result.source.url} target="_blank" rel="noreferrer">
              {new URL(result.source.url).hostname}
            </a>
          </div>
          <div className="content-export">
            <span>
              {result.sections.length} editable sections ·{" "}
              {result.scope === "body"
                ? "Page body"
                : result.scope === "main"
                  ? "Main content"
                  : "Article"}
            </span>
            <div>
              <button className="button subtle" onClick={() => void copy()}>
                <Copy size={13} /> Copy Markdown
              </button>
              <button className="button subtle" onClick={download}>
                <Download size={13} /> Download Markdown
              </button>
            </div>
          </div>
          <div
            className="content-views"
            role="group"
            aria-label="Content review view"
          >
            <button
              aria-pressed={view === "sections"}
              className={view === "sections" ? "active" : ""}
              onClick={() => setView("sections")}
            >
              Editable sections
            </button>
            <button
              aria-pressed={view === "markdown"}
              className={view === "markdown" ? "active" : ""}
              onClick={() => setView("markdown")}
            >
              Markdown
            </button>
          </div>
          {view === "sections" ? (
            <>
              <div className="selection-summary">
                <span>
                  {selected.length} selected · {slots} spaces in {destination}
                </span>
                <div>
                  <button
                    onClick={() =>
                      setChosen(
                        result.sections
                          .slice(0, slots)
                          .map((section) => section.id),
                      )
                    }
                  >
                    Select available
                  </button>
                  <button onClick={() => setChosen([])}>Clear selection</button>
                </div>
              </div>
              <div className="content-sections">
                {result.sections.map((section, index) => {
                  const checked = chosen.includes(section.id);
                  return (
                    <label
                      className={`content-section-choice ${checked ? "chosen" : ""}`}
                      key={section.id}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Include section ${index + 1}: ${section.title || "Untitled section"}`}
                        checked={checked}
                        disabled={!checked && selected.length >= slots}
                        onChange={() =>
                          setChosen(
                            checked
                              ? chosen.filter((id) => id !== section.id)
                              : [...chosen, section.id],
                          )
                        }
                      />
                      <span className="content-section-icon">
                        {section.type === "table" ? (
                          <Table2 size={17} />
                        ) : (
                          <FileText size={17} />
                        )}
                      </span>
                      <span className="content-section-copy">
                        <strong>{section.title || "Untitled section"}</strong>
                        <small>
                          {section.type === "table"
                            ? `${section.rows.length} rows · ${section.headers.length} columns`
                            : section.body.slice(0, 180) || "Heading only"}
                        </small>
                        {section.type === "table" && (
                          <span className="table-preview-label">
                            {section.headers.join(" · ")}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <textarea
              ref={markdown}
              className="markdown-output"
              aria-label="Extracted Markdown"
              readOnly
              value={result.markdown}
              spellCheck={false}
            />
          )}
          <details className="import-notes">
            <summary>What was included and adapted</summary>
            <ul>
              {result.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </details>
          {slots === 0 && (
            <p className="import-error" role="status">
              This page already has 24 sections. You can still copy or download
              Markdown, or remove a section before importing.
            </p>
          )}
          <div className="import-apply">
            <span>
              <Check size={14} /> Adds content. Keeps your existing work.
            </span>
            <button
              className="button dark"
              disabled={!selected.length || selected.length > slots}
              onClick={() => apply(selected)}
            >
              Add {selected.length || ""} section
              {selected.length === 1 ? "" : "s"} to {destination}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className="content-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
