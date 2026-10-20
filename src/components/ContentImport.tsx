import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Search,
} from "lucide-react";
import {
  contentImportSchema,
  type ContentReview,
  type ContentSection,
} from "../content";
import { markdownExample, MARKDOWN_LIMIT } from "../markdown-example";
import { ContentSections } from "./ContentSections";

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
  const [result, setResult] = useState<ContentReview | null>(null);
  const [input, setInput] = useState<"url" | "markdown">("url");
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [reviewId, setReviewId] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"sections" | "markdown">("sections");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const markdown = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  function accept(next: ContentReview) {
    setResult(next);
    setChosen(next.sections.slice(0, slots).map((section) => section.id));
    setView("sections");
    setReviewId((value) => value + 1);
  }
  function switchInput(next: "url" | "markdown") {
    if (next === input) return;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setResult(null);
    setError("");
    setStatus("");
    setChosen([]);
    setInput(next);
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    setResult(null);
    try {
      const adapter = await import("../markdown-import").catch(() => {
        throw new Error(
          "Markdown tools could not load. Reload the page and try again.",
        );
      });
      if (controller.signal.aborted) return;
      accept(adapter.importMarkdown(pasted, title));
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "This Markdown could not be prepared. Try a shorter document.",
        );
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
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
      accept(validated.data);
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
        Bring in a public page or paste Markdown. Review its headings, text,
        lists, and tables, then choose sections to add to your prototype.
      </p>
      <div
        className="content-input-toggle"
        role="group"
        aria-label="Content input"
      >
        <button
          aria-pressed={input === "url"}
          onClick={() => switchInput("url")}
        >
          Website URL
        </button>
        <button
          aria-pressed={input === "markdown"}
          onClick={() => switchInput("markdown")}
        >
          Paste Markdown
        </button>
      </div>
      {input === "url" ? (
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
              onChange={(event) => {
                setUrl(event.target.value);
                setResult(null);
                setChosen([]);
                setStatus("");
                setError("");
              }}
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
            Public HTTPS pages only. Content is read without executing scripts
            or using your login.
          </p>
          <button
            className="content-example"
            type="button"
            disabled={busy}
            onClick={() => {
              setUrl("https://formlane.netlify.app/examples/studio-notes.html");
              setResult(null);
              setChosen([]);
              setStatus("");
              setError("");
            }}
          >
            Try the studio notes example
          </button>
        </form>
      ) : (
        <form
          className="markdown-import-form"
          onSubmit={(event) => void prepare(event)}
        >
          <label htmlFor="markdown-title">Markdown title (optional)</label>
          <input
            id="markdown-title"
            disabled={busy}
            maxLength={120}
            value={title}
            placeholder="Uses the first heading when left empty"
            onChange={(event) => {
              setTitle(event.target.value);
              setResult(null);
              setStatus("");
            }}
          />
          <label htmlFor="markdown-input">Your Markdown</label>
          <textarea
            id="markdown-input"
            disabled={busy}
            value={pasted}
            placeholder="# Your next idea"
            spellCheck={false}
            aria-describedby="markdown-input-help"
            onChange={(event) => {
              setPasted(event.target.value);
              setResult(null);
              setStatus("");
              setError(
                event.target.value.length > MARKDOWN_LIMIT
                  ? "Markdown is limited to 100,000 characters. Try a shorter document."
                  : "",
              );
            }}
          />
          <p id="markdown-input-help">
            Processed in this browser. No text, links, or images are sent to a
            server. {pasted.length.toLocaleString("en-US")} / 100,000
            characters.
          </p>
          <div>
            <button
              className="content-example"
              type="button"
              disabled={busy}
              onClick={() => {
                setPasted(markdownExample);
                setTitle("");
                setResult(null);
                setError("");
                setStatus("");
              }}
            >
              Use the meeting notes example
            </button>
            <button
              className="button dark"
              disabled={
                busy || !pasted.trim() || pasted.length > MARKDOWN_LIMIT
              }
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <FileText size={15} />
              )}{" "}
              {busy ? "Preparing sections…" : "Prepare sections"}
            </button>
          </div>
        </form>
      )}
      {busy && (
        <div className="import-progress" role="status">
          <FileText size={18} />
          <div>
            <strong>Making a little room for the story.</strong>
            <span>
              {input === "markdown"
                ? "Preparing editable sections in this browser."
                : "Reading the page’s main content and preparing editable sections."}
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
            {result.scope === "markdown" ? (
              <p className="pasted-source">
                Pasted Markdown · kept in this browser
              </p>
            ) : (
              <a href={result.source.url} target="_blank" rel="noreferrer">
                {new URL(result.source.url).hostname}
              </a>
            )}
          </div>
          <div className="content-export">
            <span>
              {result.sections.length} editable sections ·{" "}
              {result.scope === "markdown"
                ? "Pasted Markdown"
                : result.scope === "body"
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
            <ContentSections
              key={reviewId}
              sections={result.sections}
              chosen={chosen}
              setChosen={setChosen}
              slots={slots}
              destination={destination}
            />
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
