import type { StyleImport } from "../theme";

const roles = {
  accent: "Accent",
  surface: "Page",
  ink: "Text",
  font: "Headings",
  radius: "Corners",
};
const bases = {
  matched: "Matched page style",
  token: "Page theme variable",
  metadata: "Page metadata",
  fallback: "Fallback",
};

export function StyleEvidence({ result }: { result: StyleImport }) {
  if (!result.evidence?.length) return null;
  return (
    <details className="style-evidence">
      <summary>Where these styles came from</summary>
      <p>
        Compare the source values with your current choices. Colors may be
        adjusted for readability, and fonts use local alternatives.
      </p>
      <dl>
        {result.evidence.map((item, index) => {
          const current =
            item.role === "font"
              ? `Local ${result.font === "serif" ? "serif" : "sans-serif"}`
              : item.role === "radius"
                ? `${result.radius}px`
                : result.palette[item.role];
          return (
            <div key={index}>
              <dt>
                {roles[item.role]} <span>{bases[item.basis]}</span>
              </dt>
              <dd>
                <strong>
                  {item.basis === "fallback" ? "Starting point" : "Detected"}:{" "}
                  {item.value}
                </strong>
                <span>Prototype: {current}</span>
                {item.selector && (
                  <code>
                    {item.selector} · {item.property}
                  </code>
                )}
                <small>{item.source}</small>
              </dd>
            </div>
          );
        })}
      </dl>
      <p>
        Static page analysis. Interactive states and conditional styles are
        omitted; review the notes for other limits.
      </p>
    </details>
  );
}
