import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { Dialog } from "./Dialog";
import {
  assistantContext,
  contextProject,
  encodeAssistantRequest,
  exampleProposal,
  reviewProposal,
  type ReviewedProposal,
} from "../assistant";
import type { PageId, Project } from "../model";

export function Assistant({
  project,
  page,
  selectedId,
  title,
  close,
  apply,
}: {
  project: Project;
  page: PageId;
  selectedId: string | null;
  title: string;
  close: () => void;
  apply: (review: ReviewedProposal) => void;
}) {
  const selected = project.pages[page].some((block) => block.id === selectedId)
    ? selectedId
    : null;
  const [scope, setScope] = useState(selected ? `section:${selected}` : "page");
  const scopedSection = project.pages[page].find(
    (block) => scope === `section:${block.id}`,
  );
  const scopedSectionId = scopedSection?.id ?? null;
  const [prompt, setPrompt] = useState("");
  const [availability, setAvailability] = useState<
    "checking" | "ready" | "disabled" | "error"
  >("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReviewedProposal | null>(null);
  const [example, setExample] = useState(false);
  const request = useRef<AbortController | null>(null);
  const previous = useRef(project);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const context = useMemo(
    () => assistantContext(project, page, scopedSectionId),
    [project, page, scopedSectionId],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assistant", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      cache: "no-store",
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error();
        const status = await response.json();
        if (
          typeof status.enabled !== "boolean" ||
          status.provider !== "Google Gemini"
        )
          throw new Error();
        if (!controller.signal.aborted)
          setAvailability(status.enabled ? "ready" : "disabled");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability("error");
      });
    return () => {
      controller.abort();
      request.current?.abort();
      request.current = null;
    };
  }, []);
  useEffect(() => {
    if (previous.current !== project) {
      previous.current = project;
      request.current?.abort();
      request.current = null;
      setBusy(false);
      setReview(null);
      setError("Your project changed. Ask again to review the latest draft.");
    }
  }, [project]);
  useEffect(() => {
    if (review) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [review]);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  function discard() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setReview(null);
    setError("");
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    discard();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setExample(false);
    try {
      const body = encodeAssistantRequest({ prompt, context });
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(55_000),
        ]),
      });
      if (request.current !== controller) return;
      if (response.status === 429)
        throw new Error(
          "A few too many suggestions. Wait a minute, then try again.",
        );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The assistant isn’t available on this deployment. Try the example or edit manually.",
        );
      const data = await response.json();
      if (request.current !== controller) return;
      if (!response.ok)
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "The assistant could not prepare a proposal. Try again.",
        );
      setReview(
        reviewProposal(
          project,
          page,
          data,
          new Set(context.blocks.map((block) => block.id)),
        ),
      );
    } catch (reason) {
      if (request.current === controller)
        setError(
          reason instanceof Error && reason.name !== "TimeoutError"
            ? reason.message
            : "The assistant took too long. Try a shorter request.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function tryExample() {
    discard();
    setExample(true);
    try {
      setReview(
        reviewProposal(
          project,
          page,
          exampleProposal(contextProject(context), page),
          new Set(context.blocks.map((block) => block.id)),
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <Dialog title="A fresh pair of eyes." close={close} wide>
      <p className="dialog-description">
        Ask for a clearer headline, a different direction, a table edit, or a
        little room for another idea. You review every change before it reaches
        your prototype.
      </p>
      <div className="assistant-status" role="status">
        {availability === "checking"
          ? "Checking AI availability…"
          : availability === "ready"
            ? "AI suggestions are available."
            : availability === "disabled"
              ? "AI suggestions aren’t enabled on this deployment yet. Try the example to explore review and undo."
              : "AI suggestions are unavailable right now. Try the example or continue editing manually."}
      </div>
      <form
        className="assistant-form"
        onSubmit={(event) => void generate(event)}
      >
        <label htmlFor="assistant-scope">Share with the assistant</label>
        <select
          id="assistant-scope"
          value={scopedSection ? scope : "page"}
          onChange={(event) => {
            discard();
            setScope(event.target.value);
          }}
        >
          <option value="page">Current template · {title}</option>
          <optgroup label="Individual sections">
            {project.pages[page].map((block, index) => (
              <option key={block.id} value={`section:${block.id}`}>
                Section {index + 1} ·{" "}
                {block.type === "quote"
                  ? "Testimonial"
                  : block.title.replace(/\s+/g, " ").trim() ||
                    "Untitled section"}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="dialog-fineprint">
          Generating a proposal sends your prompt, {context.blocks.length}{" "}
          {context.blocks.length === 1 ? "section" : "sections"}, project name,
          and shared brand settings to Google Gemini. Other templates, saved
          versions, and imported style-source details stay on this device. Brand
          and theme edits affect all six templates. Prompts and proposals are
          discarded when this dialog closes.
        </p>
        <label htmlFor="assistant-prompt">
          What would you like to explore?
        </label>
        <textarea
          id="assistant-prompt"
          rows={4}
          maxLength={2000}
          value={prompt}
          placeholder="Translate the text to Dutch."
          onChange={(event) => {
            discard();
            setPrompt(event.target.value);
          }}
        />
        <div className="assistant-actions">
          <button
            className="button dark"
            disabled={availability !== "ready" || !prompt.trim() || busy}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {busy ? "Preparing proposal…" : "Generate proposal"}
          </button>
          {busy && (
            <button className="button subtle" type="button" onClick={discard}>
              Cancel request
            </button>
          )}
          <button className="button subtle" type="button" onClick={tryExample}>
            Try an example · no AI request
          </button>
        </div>
      </form>
      {error && (
        <p ref={errorMessage} className="assistant-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <section
          className="assistant-review"
          aria-labelledby="assistant-review-heading"
        >
          <div className="assistant-review-heading">
            <h3 ref={reviewHeading} tabIndex={-1} id="assistant-review-heading">
              {example ? "Example proposal" : "Review the proposal"}
            </h3>
            <span>
              {review.changes.length}{" "}
              {review.changes.length === 1 ? "change" : "changes"}
            </span>
          </div>
          <p className="assistant-summary">{review.summary}</p>
          {!review.changes.length && (
            <p>No project changes proposed. Try a more specific request.</p>
          )}
          <ol className="assistant-changes">
            {review.changes.map((change, index) => (
              <li key={index}>
                <h4>{change.label}</h4>
                <div className="assistant-diff">
                  <div>
                    <small>Before</small>
                    <pre>{change.before || "(empty)"}</pre>
                  </div>
                  <div>
                    <small>Proposed</small>
                    <pre>{change.after || "(empty)"}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {!!review.changes.length && (
            <div className="assistant-apply">
              <p>
                Your draft stays as it is until you apply. Undo restores it in
                one step.
              </p>
              <button
                className="button dark"
                onClick={() => {
                  try {
                    apply(review);
                  } catch (reason) {
                    setError((reason as Error).message);
                  }
                }}
              >
                Apply {review.changes.length}{" "}
                {review.changes.length === 1 ? "change" : "changes"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
      )}
    </Dialog>
  );
}
