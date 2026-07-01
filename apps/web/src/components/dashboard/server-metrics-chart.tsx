"use client";

import {
  CategoryScale,
  Chart as ChartJS,
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend);

type MetricPoint = {
  reportedAt: string;
  cpuPercent: number | null;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  load1: number | null;
};

function memPercent(point: MetricPoint) {
  if (point.memUsed == null || point.memTotal == null || point.memTotal === 0) return null;
  return Number(((point.memUsed / point.memTotal) * 100).toFixed(1));
}

function diskPercent(point: MetricPoint) {
  if (point.diskUsed == null || point.diskTotal == null || point.diskTotal === 0) return null;
  return Number(((point.diskUsed / point.diskTotal) * 100).toFixed(1));
}

function buildChart(metrics: MetricPoint[], label: string, valueFn: (p: MetricPoint) => number | null, color: string) {
  const data = metrics
    .map((point) => ({ x: new Date(point.reportedAt).getTime(), y: valueFn(point) }))
    .filter((point) => point.y != null);

  return {
    datasets: [
      {
        label,
        data,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { type: "time" as const, grid: { display: false }, ticks: { maxTicksLimit: 8, color: "#64748b", font: { size: 11 } } },
    y: { beginAtZero: true, grid: { color: "rgba(148, 163, 184, 0.2)" }, ticks: { color: "#64748b", font: { size: 11 } } },
  },
  plugins: { legend: { display: false } },
};

export function ServerMetricsCharts({ metrics }: { metrics: MetricPoint[] }) {
  if (metrics.length === 0) {
    return <p className="text-sm text-muted-foreground">等待 Agent 上报数据...</p>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>CPU 使用率</CardTitle></CardHeader>
        <CardContent className="h-[240px]">
          <Line data={buildChart(metrics, "CPU %", (p) => p.cpuPercent, "rgb(16, 185, 129)")} options={chartOptions} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>内存使用率</CardTitle></CardHeader>
        <CardContent className="h-[240px]">
          <Line data={buildChart(metrics, "内存 %", memPercent, "rgb(59, 130, 246)")} options={chartOptions} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>磁盘使用率</CardTitle></CardHeader>
        <CardContent className="h-[240px]">
          <Line data={buildChart(metrics, "磁盘 %", diskPercent, "rgb(245, 158, 11)")} options={chartOptions} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>系统负载 (1m)</CardTitle></CardHeader>
        <CardContent className="h-[240px]">
          <Line data={buildChart(metrics, "Load", (p) => p.load1, "rgb(139, 92, 246)")} options={chartOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
