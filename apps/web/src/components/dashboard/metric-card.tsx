import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  accent?: "default" | "live";
  className?: string;
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
            {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          {Icon ? (
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                accent === "live" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-600",
              )}
            >
              {accent === "live" ? (
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 animate-pulse-dot rounded-full bg-emerald-500" />
                </span>
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
