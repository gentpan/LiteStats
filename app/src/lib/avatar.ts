import { createHash } from "node:crypto"

export function gravatarUrl(email: string) {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
  return `https://www.gravatar.com/avatar/${hash}?s=256&d=404&r=g`
}
