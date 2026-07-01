import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountryFlag } from "@/components/dashboard/country-flag";
import { formatNumber, formatPercent } from "@/lib/utils";

export type BreakdownItem = {
  name: string;
  count: number;
  code?: string;
};

type BreakdownPanelProps = {
  title: string;
  rows: BreakdownItem[];
  emptyText: string;
  total?: number;
  icon?: ReactNode;
  showFlags?: boolean;
};

export function BreakdownPanel({
  title,
  rows,
  emptyText,
  total,
  icon,
  showFlags = false,
}: BreakdownPanelProps) {
  const max = rows[0]?.count ?? 0;
  const computedTotal = total ?? rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((row, index) => (
              <li key={`${row.name}-${index}`} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate font-medium text-foreground">
                    {showFlags ? <CountryFlag code={row.code} title={row.name} /> : null}
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatNumber(row.count)}
                    <span className="ml-2 text-xs">({formatPercent(row.count, computedTotal)})</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                    style={{ width: `${max === 0 ? 0 : (row.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
