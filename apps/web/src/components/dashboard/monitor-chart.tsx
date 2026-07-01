"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler);

type MonitorChartPoint = {
  checkedAt: string;
  responseMs: number | null;
  status: string;
};

export function MonitorUptimeChart({ checks }: { checks: MonitorChartPoint[] }) {
  const upChecks = checks.filter((check) => check.status === "up" && check.responseMs != null);

  const data = {
    datasets: [
      {
        label: "响应时间 (ms)",
        data: upChecks.map((check) => ({
          x: new Date(check.checkedAt).getTime(),
          y: check.responseMs,
        })),
        borderColor: "rgb(16, 185, 129)",
        backgroundColor: "rgba(16, 185, 129, 0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    scales: {
      x: {
        type: "time" as const,
        grid: { display: false },
        ticks: { maxTicksLimit: 8, color: "#64748b", font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        ticks: { color: "#64748b", font: { size: 11 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number | null } }) => ` ${ctx.parsed.y ?? 0} ms`,
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>响应时间趋势</CardTitle>
      </CardHeader>
      <CardContent>
        {upChecks.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">暂无可用检测数据</p>
        ) : (
          <div className="h-[280px]">
            <Line data={data} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MonitorIncidentTimeline({ checks }: { checks: MonitorChartPoint[] }) {
  const recent = [...checks].reverse().slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>最近检测记录</CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">等待首次检测...</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((check) => (
              <li key={check.checkedAt} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${check.status === "up" ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                  <span className="text-muted-foreground">
                    {new Date(check.checkedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <span className="tabular-nums">
                  {check.status === "up" && check.responseMs != null ? `${check.responseMs} ms` : "离线"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
