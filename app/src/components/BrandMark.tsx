import type { CSSProperties } from "react"
import geometry from "~/assets/brand.json"

// The same O stays visible as it moves into the wordmark. Rendering another O
// in the wordmark would produce a double stroke halfway through the transition.
export function LogoMark({ className = "logo-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox={geometry.mark_bb.join(" ")} aria-hidden="true">
      <g transform={`translate(${geometry.mark_dx} 0)`}>
        <path d={geometry.mark_d} fillRule="evenodd" />
      </g>
    </svg>
  )
}

export function BrandMark({ className = "" }: { className?: string }) {
  const style = {
    "--plost-mark-width": `${geometry.css.mk_w * 100}%`,
    "--plost-wordmark-width": `${geometry.css.wm_w * 100}%`,
    "--plost-wordmark-height": `${geometry.css.wm_h * 100}%`,
    "--plost-morph-scale": geometry.css.k,
    "--plost-morph-x": geometry.css.tx,
    "--plost-morph-y": geometry.css.ty,
  } as CSSProperties
  return (
    <span className={`logo plost-logo ${className}`.trim()} role="img" aria-label="Plost" style={style}>
      <span className="plost-logo__badge">
        <span className="plost-logo__pill" aria-hidden="true" />
        <span className="plost-logo__tile">
          <svg className="plost-logo__shape" viewBox="0 0 100 100" aria-hidden="true">
            <path className="plost-logo__shape-bg" d={geometry.shape} />
            <path className="plost-logo__shape-hl" d={geometry.inner} />
          </svg>
        </span>
        <svg className="plost-logo__wordmark" viewBox={geometry.vb.join(" ")} aria-hidden="true">
          {geometry.letters.filter(letter => letter.key !== geometry.mark_key).map(letter => (
            <g key={letter.key} transform={`translate(${letter.dx} 0)`}>
              <path d={letter.d} fillRule={letter.rule as "evenodd" | "nonzero"} />
            </g>
          ))}
        </svg>
        <LogoMark className="plost-logo__mark" />
      </span>
    </span>
  )
}
