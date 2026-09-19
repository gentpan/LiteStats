const paths: Record<string,string> = {
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  lock:'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4',
  key:'M14 4a6 6 0 1 1-3 11L5 21H2v-3l6-6a6 6 0 0 1 6-8 M16 8h.01',
  warn:'M12 3 2 21h20L12 3 M12 9v5 M12 17h.01',
  telegram:'M21 3 3 10l7 3 3 7 8-17 M10 13l5-5 M10 13l-1 6 4-3',
  mail:'M3 5h18v14H3z M3 6l9 7 9-7',
  cloud:'M7 18H6a4 4 0 1 1 1-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 0 9h-2 M12 12v9 M9 18l3 3 3-3',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5 M9 3v16 M15 5v16',
  activity:'M2 12h5l3-8 4 16 3-8h5',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  copy:'M9 9h12v12H9z M15 9V3H3v12h6',
  check:'M5 12l4 4L19 6',
  funnel:'M3 4h18l-7 9v7l-4-2v-5L3 4',
  tag:'M3 3h8l10 10-8 8L3 11V3 M7 7h.01',
  code:'M8 6 2 12l6 6 M16 6l6 6-6 6 M14 3l-4 18',
  plug:'M8 3v5 M16 3v5 M6 8h12v3a6 6 0 0 1-12 0V8 M12 17v4',
  download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  shield:'M12 3l9 4v5c0 5-9 9-9 9s-9-4-9-9V7l9-4',
  save:'M4 3h13l4 4v14H3V3h1 M7 3v6h9V3 M7 21v-7h10v7',
  plus:'M12 4v16 M4 12h16',
  trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  arrow:'M4 12h16 M14 6l6 6-6 6',
  external:'M14 3h7v7 M21 3l-11 11 M10 3H3v18h18v-7',
  refresh:'M20 7V3m0 4h-4 M20 7a9 9 0 1 0 1 8',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
  search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M15 15l6 6',
}
const aliases:Record<string,string>={cog:'settings',sliders:'settings',rocket:'globe',users:'user',puzzle:'plug'}
export function UIIcon({name,className=""}:{name:string,className?:string}) {
  return <svg className={`ui-icon ${className}`} aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[aliases[name] || name] || paths.settings} /></svg>
}
export type BrandName = "telegram" | "google" | "google-maps" | "mapbox" | "bing" | "cloudflare"
export function BrandIcon({name,className=""}:{name:BrandName,className?:string}) {
  return <img src={`/brands/${name}.svg`} alt="" aria-hidden="true" className={`brand-icon brand-${name} ${className}`} />
}
