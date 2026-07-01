"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";
import { getFaviconUrl, normalizeSiteDomain } from "@/lib/favicon";
import { cn } from "@/lib/utils";

type SiteFaviconProps = {
  domain: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "h-6 w-6 rounded-md text-[10px]",
  md: "h-8 w-8 rounded-lg text-xs",
  lg: "h-10 w-10 rounded-xl text-sm",
};

export function SiteFavicon({ domain, name, size = "md", className }: SiteFaviconProps) {
  const [failed, setFailed] = useState(false);
  const host = normalizeSiteDomain(domain);
  const src = getFaviconUrl(domain);
  const label = host || name || "site";
  const initials = (name ?? host ?? "?").slice(0, 2).toUpperCase();

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center bg-muted font-semibold uppercase text-muted-foreground",
          sizeClass[size],
          className,
        )}
        title={label}
      >
        {initials === "?" ? <Globe2 className="h-3.5 w-3.5" /> : initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("inline-block shrink-0 bg-white object-contain ring-1 ring-black/5", sizeClass[size], className)}
      title={label}
    />
  );
}
