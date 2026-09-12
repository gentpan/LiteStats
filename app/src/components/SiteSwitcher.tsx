import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { siteDomainsFn } from "~/lib/actions"

function Favicon({ domain, className }: { domain: string, className?: string }) {
  return (
    <img
      alt=""
      src={`/favicon/sources/${encodeURIComponent(domain)}`}
      onError={(e) => {
        const target = e.target as HTMLImageElement
        target.onerror = null
        target.src = "/favicon/sources/placeholder"
      }}
      referrerPolicy="no-referrer"
      className={className}
    />
  )
}

export function SiteSwitcher({
  domain,
  readonly,
}: {
  domain: string
  readonly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [sites, setSites] = useState<Array<{ domain: string }>>([])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [])

  useEffect(() => {
    if (readonly) return
    void siteDomainsFn().then(setSites).catch(() => setSites([]))
  }, [readonly])

  useEffect(() => {
    if (readonly) return
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 8 && sites[n - 1]) {
        e.preventDefault()
        window.location.assign(`/sites/${encodeURIComponent(sites[n - 1].domain)}`)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [readonly, sites])

  if (readonly) {
    return (
      <div className="flex h-8 items-center gap-x-1.5 rounded-md pr-2.5 pl-0 text-sm font-medium text-gray-700" title={domain}>
        <Favicon domain={domain} className="block size-4" />
        <span className="hidden truncate font-semibold sm:mr-1 sm:block lg:mr-0">{domain}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        title={domain}
        className={`flex h-8 items-center gap-x-1.5 rounded-md !pl-1.5 pr-2.5 text-sm font-medium text-gray-700 hover:bg-gray-150/80 ${open ? "bg-gray-150/80" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Favicon domain={domain} className="block size-4" />
        <span className="hidden truncate font-semibold sm:mr-1 sm:block lg:mr-0">{domain}</span>
        <svg className="hidden size-4 lg:block" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-2 flex w-[min(100vw-2rem,20rem)] origin-top-left flex-col gap-0.5 rounded-md bg-white p-1 font-medium text-gray-800 shadow-lg ring-1 ring-black/5">
          <div className="flex">
            <Link
              to="/"
              className="mx-1 my-1 flex flex-1 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:border-gray-400/70 hover:text-gray-900"
              onClick={() => setOpen(false)}
            >
              <svg className="mr-1.5 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              返回站点
            </Link>
            <Link
              to="/sites/$domain/settings"
              params={{ domain }}
              search={{ tab: "general" }}
              className="mx-1 my-1 flex flex-1 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:border-gray-400/70 hover:text-gray-900"
              onClick={() => setOpen(false)}
            >
              <svg className="mr-1.5 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              站点设置
            </Link>
          </div>
          <div className="my-1 h-px bg-gray-200" />
          {sites.map((site, index) => (
            <Link
              key={site.domain}
              to="/sites/$domain"
              params={{ domain: site.domain }}
              data-selected={site.domain === domain}
              className="flex items-center justify-between rounded-md px-4 py-2.5 text-sm leading-tight hover:bg-gray-100 hover:text-gray-900 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900"
              onClick={() => setOpen(false)}
            >
              <span className="flex min-w-0 items-center">
                <Favicon domain={site.domain} className="mr-2 block h-4 w-4" />
                <span className="mr-auto truncate">{site.domain}</span>
              </span>
              {sites.length > 1 && index < 8 ? <kbd className="text-xs font-normal text-gray-400">{index + 1}</kbd> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
