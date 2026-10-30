import { useEffect, useRef, useState, type ReactNode } from "react"

type ImageProps = {src: string; className: string; fallback: ReactNode}

/** A new source gets a fresh attempt, including when returning to an earlier source. */
export function ImageWithFallback(props: ImageProps) {
  return <ImageAttempt key={props.src} {...props}/>
}

function ImageAttempt({src, className, fallback}: ImageProps) {
  const image = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    // An SSR image may have failed before React attached its error listener.
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true)
  }, [])
  if (failed) return fallback
  return <img ref={image} alt="" src={src} className={className}
    referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)}/>
}
