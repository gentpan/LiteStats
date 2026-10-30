/** Quiet progress for data that is reloading behind content already on screen. */
export function DotsLoader({ label, className = "" }: { label: string; className?: string }) {
  return <span className={`dots-loader ${className}`} role="status" aria-label={label}><i /><i /><i /></span>
}
