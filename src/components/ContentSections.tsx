import { useId, useState, type Dispatch, type SetStateAction } from "react";
import { FileText, Table2 } from "lucide-react";
import type { ContentSection } from "../content";

export function ContentSections({
  sections,
  chosen,
  setChosen,
  slots,
  destination,
}: {
  sections: ContentSection[];
  chosen: string[];
  setChosen: Dispatch<SetStateAction<string[]>>;
  slots: number;
  destination: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "text" | "table">("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const prefix = useId();
  const needle = query.trim().toLocaleLowerCase();
  const visible = sections
    .map((section, index) => ({ section, index }))
    .filter(
      ({ section }) =>
        (filter === "all" || section.type === filter) &&
        (!needle ||
          (
            section.title +
            " " +
            (section.type === "text"
              ? section.body
              : [...section.headers, ...section.rows.flat()].join(" "))
          )
            .toLocaleLowerCase()
            .includes(needle)),
    );
  const hiddenSelected = chosen.filter(
    (id) => !visible.some(({ section }) => section.id === id),
  ).length;
  return (
    <>
      <div className="content-filter">
        <label htmlFor={`${prefix}-search`}>Find sections</label>
        <input
          id={`${prefix}-search`}
          type="search"
          placeholder="Search headings, text, or table cells"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div
          className="content-type-filters"
          role="group"
          aria-label="Section type"
        >
          {(
            [
              ["all", "All sections"],
              ["text", "Text"],
              ["table", "Tables"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="selection-summary">
        <span role="status">
          {chosen.length} selected · {slots} spaces in {destination}
          <small>
            Showing {visible.length} of {sections.length} sections
            {hiddenSelected
              ? ` · ${hiddenSelected} selected outside this filter`
              : ""}
          </small>
        </span>
        <div>
          <button
            disabled={!visible.length || chosen.length >= slots}
            onClick={() =>
              setChosen((previous) => {
                const next = [...previous];
                for (const { section } of visible)
                  if (next.length < slots && !next.includes(section.id))
                    next.push(section.id);
                return next;
              })
            }
          >
            {needle || filter !== "all"
              ? "Select matching"
              : "Select available"}
          </button>
          <button onClick={() => setChosen([])}>Clear selection</button>
        </div>
      </div>
      {!visible.length && (
        <p className="content-empty" role="status">
          No matching sections. Change the search or type filter. Your
          selections are kept.
        </p>
      )}
      <div className="content-sections">
        {visible.map(({ section, index }) => {
          const checked = chosen.includes(section.id);
          const open = expanded.includes(section.id);
          const title = section.title || "Untitled section";
          const previewId = `${prefix}-${section.id}`;
          return (
            <div
              key={section.id}
              className={`content-section-card ${checked ? "chosen" : ""}`}
            >
              <label className="content-section-choice">
                <input
                  type="checkbox"
                  aria-label={`Include section ${index + 1}: ${title}`}
                  checked={checked}
                  disabled={!checked && chosen.length >= slots}
                  onChange={() =>
                    setChosen((previous) =>
                      previous.includes(section.id)
                        ? previous.filter((id) => id !== section.id)
                        : previous.length < slots
                          ? [...previous, section.id]
                          : previous,
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
                  <strong>{title}</strong>
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
              <button
                className="section-preview-toggle"
                aria-label={`Preview section ${index + 1}: ${title}`}
                aria-expanded={open}
                aria-controls={previewId}
                onClick={() =>
                  setExpanded((previous) =>
                    open
                      ? previous.filter((id) => id !== section.id)
                      : [...previous, section.id],
                  )
                }
              >
                {open ? "Hide preview" : "Preview full section"}
              </button>
              <div
                id={previewId}
                hidden={!open}
                className="section-full-preview"
                role="region"
                aria-label={`Full preview: ${title}`}
              >
                {open &&
                  (section.type === "text" ? (
                    <p>
                      {section.body || "This section contains a heading only."}
                    </p>
                  ) : (
                    <div
                      className="content-table-preview"
                      tabIndex={0}
                      role="region"
                      aria-label={`Scrollable table: ${title}`}
                    >
                      <table aria-label={`Preview table: ${title}`}>
                        <thead>
                          <tr>
                            {section.headers.map((header, i) => (
                              <th key={i} scope="col">
                                {header || `Column ${i + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => (
                                <td key={j}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!section.rows.length && <p>No data rows.</p>}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="selection-order-note">
        Sections are added in their original order, including selections outside
        the current filter.
      </p>
    </>
  );
}
