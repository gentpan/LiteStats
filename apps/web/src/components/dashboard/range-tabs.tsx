"use client";

import { cn } from "@/lib/utils";

export type TimeRange = "24h" | "7d" | "30d";

const ranges: Array<{ value: TimeRange; label: string }> = [
  { value: "24h", label: "24 小时" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

type RangeTabsProps = {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  className?: string;
};

export function RangeTabs({ value, onChange, className }: RangeTabsProps) {
  return (
    <div className={cn("inline-flex rounded-xl border border-border bg-white p-1 shadow-sm", className)}>
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => onChange(range.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === range.value
              ? "bg-slate-900 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
