import { cn } from "@/lib/utils";
import type { SslHealth } from "@/lib/monitor-check";

type MonitorStatusBadgeProps = {
  status: "up" | "down" | "unknown";
  className?: string;
};

export function MonitorStatusBadge({ status, className }: MonitorStatusBadgeProps) {
  const styles = {
    up: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    down: "bg-red-100 text-red-800 ring-red-200",
    unknown: "bg-slate-100 text-slate-600 ring-slate-200",
  } as const;

  const labels = {
    up: "在线",
    down: "离线",
    unknown: "未知",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[status],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "up" && "bg-emerald-500",
          status === "down" && "bg-red-500",
          status === "unknown" && "bg-slate-400",
        )}
      />
      {labels[status]}
    </span>
  );
}

type SslStatusBadgeProps = {
  health: SslHealth;
  daysLeft?: number | null;
  className?: string;
};

export function SslStatusBadge({ health, daysLeft, className }: SslStatusBadgeProps) {
  const config = {
    ok: { label: daysLeft != null ? `SSL ${daysLeft} 天` : "SSL 正常", className: "bg-emerald-50 text-emerald-700" },
    warning: { label: daysLeft != null ? `SSL ${daysLeft} 天` : "SSL 即将过期", className: "bg-amber-50 text-amber-700" },
    critical: { label: daysLeft != null ? `SSL ${daysLeft} 天` : "SSL 紧急", className: "bg-red-50 text-red-700" },
    invalid: { label: "SSL 无效", className: "bg-red-50 text-red-700" },
    none: { label: "无 HTTPS", className: "bg-slate-100 text-slate-600" },
  } as const;

  const item = config[health];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", item.className, className)}>
      <i className="fa-solid fa-lock mr-1.5 text-[10px]" aria-hidden />
      {item.label}
    </span>
  );
}
