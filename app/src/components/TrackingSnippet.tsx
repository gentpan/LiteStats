import { useEffect, useRef, useState } from "react"
import { ActionButton } from "./ActionButton"
import { useT } from "~/lib/i18n"

export function TrackingSnippet({code, language}:{code:string, language?: string}) {
  const {t}=useT()
  const [copied,setCopied]=useState(false)
  const [error,setError]=useState(false)
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  useEffect(()=>()=>clearTimeout(timer.current),[])
  const langLabel = language || (code.trim().startsWith("<") ? "HTML" : code.trim().startsWith("curl") ? "cURL" : code.trim().startsWith("http") ? "HTTP" : "JavaScript")
  return <div className="tracking-snippet">
    <div className="tracking-snippet-toolbar"><span>{langLabel}</span><ActionButton className="snippet-copy" aria-label={t(copied ? "已复制" : "复制代码")} title={t(copied ? "已复制" : "复制代码")} icon={copied ? "check" : "copy"} onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setError(false);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2500)}catch{setError(true)}}}></ActionButton></div>
    <pre><code>{code}</code></pre>
    {error ? <p role="alert">{t("复制失败，请手动选择代码复制。")}</p> : null}
    <span className="sr-only" role="status">{copied ? t("已复制") : ""}</span>
  </div>
}
