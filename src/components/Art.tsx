import { useId } from "react";

export function Art({
  kind,
  className = "",
}: {
  kind: "hero" | "vase" | "lamp" | "chair";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`product-art ${className}`}
      viewBox="0 0 440 400"
      role="img"
      aria-label={
        kind === "hero"
          ? "A sunlit still life with sculptural ceramics and olive branches"
          : `Illustration of a ${kind}`
      }
    >
      <defs>
        <linearGradient id={`${id}-wall`} x2="1" y2="1">
          <stop stopColor="#e9dfcf" />
          <stop offset="1" stopColor="#cdbda4" />
        </linearGradient>
        <linearGradient id={`${id}-clay`} x2="1">
          <stop stopColor="#b38b69" />
          <stop offset=".3" stopColor="#e0c3a3" />
          <stop offset=".7" stopColor="#d6b38f" />
          <stop offset="1" stopColor="#a57b57" />
        </linearGradient>
        <linearGradient id={`${id}-cream`} x2="1">
          <stop stopColor="#bbb5a1" />
          <stop offset=".4" stopColor="#e6e2d1" />
          <stop offset=".75" stopColor="#d9d5bf" />
          <stop offset="1" stopColor="#b3ad96" />
        </linearGradient>
        <linearGradient id={`${id}-wood`} x2="1">
          <stop stopColor="#977756" />
          <stop offset=".5" stopColor="#caab7b" />
          <stop offset="1" stopColor="#a18056" />
        </linearGradient>
        <radialGradient id={`${id}-shade`}>
          <stop stopColor="#f1e5c7" />
          <stop offset="1" stopColor="#c3ad88" />
        </radialGradient>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <rect
        width="440"
        height="400"
        fill={
          kind === "hero"
            ? `url(#${id}-wall)`
            : kind === "lamp"
              ? "#e7e8de"
              : kind === "chair"
                ? "#e6dfd3"
                : "#e9e3d8"
        }
      />
      {kind === "hero" && (
        <>
          <path
            d="M290 0h45L80 280H0v-25zM370 0h35L170 280h-53z"
            fill="#fff7dc"
            opacity=".35"
          />
          <path d="M0 281h440v119H0z" fill="#d4c5af" />
          <path d="M0 281h440" stroke="#bbab93" />
          <ellipse
            cx="254"
            cy="346"
            rx="137"
            ry="15"
            fill="#726046"
            opacity=".23"
            filter={`url(#${id}-blur)`}
          />
        </>
      )}
      {kind === "vase" && (
        <ellipse
          cx="224"
          cy="329"
          rx="100"
          ry="13"
          fill="#8a745c"
          opacity=".22"
          filter={`url(#${id}-blur)`}
        />
      )}
      {(kind === "vase" || kind === "hero") && (
        <g
          transform={
            kind === "hero" ? "translate(83 60) scale(.86)" : "translate(7 0)"
          }
        >
          <path
            d="M184 137c-1-18-6-28-5-38h59c1 12-5 22-5 38 0 23 45 34 48 85 3 38-11 84-27 103h-87c-22-21-39-66-33-103 8-48 51-60 50-85z"
            fill={`url(#${id}-clay)`}
          />
          <ellipse cx="208" cy="99" rx="29" ry="6" fill="#8a6749" />
          <ellipse cx="208" cy="100" rx="23" ry="3" fill="#73533b" />
          <path
            d="M155 204c-28-40-58-30-57 6 1 31 34 43 46 40"
            fill="none"
            stroke="#b58d67"
            strokeWidth="17"
          />
          <path
            d="M155 204c-28-40-58-30-57 6 1 31 34 43 46 40"
            fill="none"
            stroke="#d6b28e"
            strokeWidth="10"
          />
          <path
            d="M170 157c17 7 58 7 77-1M148 210c28 9 100 9 130-2M141 249c32 8 100 8 137-2M152 289c29 7 84 7 113-2"
            stroke="#8f6747"
            strokeWidth="1"
            fill="none"
            opacity=".18"
          />
          {kind === "hero" && (
            <>
              <path
                d="M207 100q-20-73 24-154M208 90q-4-54-52-91M218 40q45-31 61-65"
                fill="none"
                stroke="#656c40"
                strokeWidth="3"
              />
              {[
                [221, -30, -20],
                [202, 13, -45],
                [226, -8, 20],
                [250, 13, 40],
                [180, 27, -45],
                [160, 0, -55],
                [214, 62, -40],
                [269, -14, 50],
              ].map(([x, y, r], i) => (
                <ellipse
                  key={i}
                  cx={x}
                  cy={y}
                  rx="6"
                  ry="17"
                  transform={`rotate(${r} ${x} ${y})`}
                  fill={i % 2 ? "#7e8959" : "#596540"}
                />
              ))}
            </>
          )}
        </g>
      )}
      {kind === "hero" && (
        <>
          <path
            d="M75 292q-17-61 20-96h48q36 35 20 96l-13 36H89z"
            fill={`url(#${id}-cream)`}
          />
          <ellipse cx="119" cy="196" rx="24" ry="5" fill="#a6a18e" />
          <path d="M316 305h80v15h-80z" fill="#a49375" />
          <path d="M310 294h80v11h-80z" fill="#e4ddca" />
          <path d="M343 265c-2-16 25-21 28-5 3 14-21 24-28 5z" fill="#9a977c" />
        </>
      )}
      {kind === "lamp" && (
        <>
          <ellipse
            cx="221"
            cy="330"
            rx="101"
            ry="12"
            fill="#77775e"
            opacity=".22"
            filter={`url(#${id}-blur)`}
          />
          <path d="M203 195h33l7 112h-47z" fill={`url(#${id}-clay)`} />
          <ellipse
            cx="220"
            cy="307"
            rx="46"
            ry="13"
            fill={`url(#${id}-clay)`}
          />
          <path
            d="M149 91q70-25 141 0l39 124H111z"
            fill={`url(#${id}-shade)`}
          />
          <ellipse cx="220" cy="215" rx="109" ry="13" fill="#b6a282" />
          {Array.from({ length: 15 }, (_, i) => (
            <path
              key={i}
              d={`M${151 + i * 10} 92L${115 + i * 15} 212`}
              stroke="#aa9474"
              opacity=".27"
            />
          ))}
        </>
      )}
      {kind === "chair" && (
        <>
          <ellipse
            cx="220"
            cy="340"
            rx="116"
            ry="12"
            fill="#806a50"
            opacity=".2"
            filter={`url(#${id}-blur)`}
          />
          <g fill={`url(#${id}-wood)`}>
            <rect x="125" y="100" width="13" height="230" />
            <rect x="294" y="100" width="13" height="230" />
            <rect x="125" y="84" width="182" height="28" />
            <rect x="138" y="171" width="156" height="12" />
            {/* Level cross edges retain the original seat-side slopes. */}
            <path d={`M136 200H279L${279 + (35 * 41) / 34} 241H151Z`} />
            <rect x="151" y="241" width={128 + (35 * 41) / 34} height="9" />
            <rect x="151" y="250" width="14" height="85" />
            <rect x="307" y="250" width="14" height="85" />
          </g>
          <path
            d={`M145 204H281L${281 + (28 * 36) / 31} 240H156Z`}
            fill="#c5b79b"
          />
          <path
            d="M153 212H284M156 220H291M159 228H298M162 236H305"
            stroke="#b3a486"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}
