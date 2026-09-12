/** Xiaomi Alive superellipse, n=3: |x|^3 + |y|^3 = 1 */
const SUPERELLIPSE_N3 =
  "M63.75 32L63.7 37.15L63.57 40.17L63.34 42.68L63.02 44.89L62.62 46.9L62.12 48.74L61.53 50.43L60.85 52L60.07 53.46L59.21 54.81L58.25 56.05L57.2 57.2L56.05 58.25L54.81 59.21L53.46 60.07L52 60.85L50.43 61.53L48.74 62.12L46.9 62.62L44.89 63.02L42.68 63.34L40.17 63.57L37.15 63.7L32 63.75L26.85 63.7L23.83 63.57L21.32 63.34L19.11 63.02L17.1 62.62L15.26 62.12L13.57 61.53L12 60.85L10.54 60.07L9.19 59.21L7.95 58.25L6.8 57.2L5.75 56.05L4.79 54.81L3.93 53.46L3.15 52L2.47 50.43L1.88 48.74L1.38 46.9L0.98 44.89L0.66 42.68L0.43 40.17L0.3 37.15L0.25 32L0.3 26.85L0.43 23.83L0.66 21.32L0.98 19.11L1.38 17.1L1.88 15.26L2.47 13.57L3.15 12L3.93 10.54L4.79 9.19L5.75 7.95L6.8 6.8L7.95 5.75L9.19 4.79L10.54 3.93L12 3.15L13.57 2.47L15.26 1.88L17.1 1.38L19.11 0.98L21.32 0.66L23.83 0.43L26.85 0.3L32 0.25L37.15 0.3L40.17 0.43L42.68 0.66L44.89 0.98L46.9 1.38L48.74 1.88L50.43 2.47L52 3.15L53.46 3.93L54.81 4.79L56.05 5.75L57.2 6.8L58.25 7.95L59.21 9.19L60.07 10.54L60.85 12L61.53 13.57L62.12 15.26L62.62 17.1L63.02 19.11L63.34 21.32L63.57 23.83L63.7 26.85Z"

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`logo-mark ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true">
      <path className="logo-mark-plate" d={SUPERELLIPSE_N3} />
      <g className="logo-mark-bars">
        <rect x="13" y="36" width="10" height="16" rx="5" />
        <rect x="27" y="14" width="10" height="38" rx="5" />
        <rect x="41" y="24" width="10" height="28" rx="5" />
      </g>
    </svg>
  )
}

export function BrandMark({
  className = "",
}: {
  className?: string
}) {
  return (
    <span className={`logo ${className}`.trim()} aria-label="LiteStats">
      <LogoMark />
      <span className="logo-copy">
        <span className="logo-wordmark">
          <span className="logo-wordmark-lite">Lite</span>
          <span className="logo-wordmark-stats">Stats</span>
        </span>
        <span className="logo-tagline">Self-hosted analytics</span>
      </span>
    </span>
  )
}
