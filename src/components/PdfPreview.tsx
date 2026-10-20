import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Printer, X } from "lucide-react";
import { pageIds, type PageId, type Project } from "../model";
import { BlockContent } from "./Blocks";

export function PdfPreview({
  project,
  currentPage,
  titles,
  themeStyle,
  close,
}: {
  project: Project;
  currentPage: PageId;
  titles: Record<PageId, { title: string }>;
  themeStyle: CSSProperties;
  close: () => void;
}) {
  const [scope, setScope] = useState("current");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const title = document.title;
    document.title = `${project.name} — Formlane`;
    return () => {
      document.title = title;
    };
  }, [project.name]);
  return (
    <main
      className="pdf-export"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <header className="pdf-controls">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            Ready for the meeting.
          </h1>
          <p>
            Choose “Save as PDF” in your browser’s print dialog. Use A4
            portrait, default scale, and turn off browser headers and footers.
            Enable background graphics to keep theme colors.
          </p>
        </div>
        <label>
          Include
          <select
            aria-label="PDF templates"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="current">
              Current template · {titles[currentPage].title}
            </option>
            <option value="all">All six templates</option>
          </select>
        </label>
        <button
          className="button dark"
          onClick={async () => {
            try {
              await document.fonts.ready;
              window.print();
            } catch {
              setError(
                "Printing is unavailable in this browser. Try its Print menu or export a project file instead.",
              );
            }
          }}
        >
          <Printer size={16} />
          Print / save PDF
        </button>
        <button className="button subtle" onClick={close}>
          <X size={16} />
          Back to editor
        </button>
        {error && <p role="alert">{error}</p>}
      </header>
      <div className="pdf-pages">
        {(scope === "all" ? pageIds : [currentPage]).map((id) => (
          <section
            className="pdf-template"
            key={id}
            aria-label={`${titles[id].title} PDF`}
          >
            <header className="pdf-page-heading">
              <span>{project.name}</span>
              <strong>{titles[id].title}</strong>
              <small>Prototype · Formlane</small>
            </header>
            <div
              className="prototype-canvas"
              style={themeStyle}
              data-template={id}
              data-theme={
                project.theme.custom ? "custom" : project.theme.preset
              }
            >
              <div className="prototype-nav">
                <span className="prototype-brand">{project.brand}</span>
              </div>
              <div
                className={`template-sections ${id === "dashboard" ? "dashboard-grid" : ""}`}
              >
                {project.pages[id].map((block) => (
                  <div
                    className="canvas-block"
                    data-block-type={block.type}
                    data-text-appearance={
                      block.type === "text" ? block.appearance : undefined
                    }
                    key={block.id}
                  >
                    <BlockContent
                      block={block}
                      preview
                      template={id}
                      update={() => {}}
                    />
                  </div>
                ))}
              </div>
              <footer className="prototype-footer">
                <span>{project.brand}</span>
                <small>Built to imagine · Formlane</small>
              </footer>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
