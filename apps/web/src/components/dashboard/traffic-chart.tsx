"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatsRange } from "@/lib/analytics";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

type TrafficChartProps = {
  range: StatsRange;
  data: Array<{ time: string; pageviews: number; visitors: number }>;
};

function formatLabel(time: string, range: StatsRange) {
  if (range === "24h") {
    const hour = time.slice(11, 13);
    return `${hour}:00`;
  }
  const date = new Date(`${time}T00:00:00`);
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function TrafficChart({ range, data }: TrafficChartProps) {
  const labels = data.map((point) => formatLabel(point.time, range));

  const chartData = {
    labels,
    datasets: [
      {
        label: "页面浏览量",
        data: data.map((point) => point.pageviews),
        borderColor: "#059669",
        backgroundColor: "rgba(5, 150, 105, 0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "独立访客",
        data: data.map((point) => point.visitors),
        borderColor: "#334155",
        backgroundColor: "transparent",
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          padding: 20,
          color: "#64748b",
          font: { size: 12 },
        },
      },
      tooltip: {
        backgroundColor: "#0f172a",
        titleColor: "#f8fafc",
        bodyColor: "#e2e8f0",
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#94a3b8",
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.15)" },
        ticks: { color: "#94a3b8", precision: 0 },
        border: { display: false },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>流量趋势</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            暂无趋势数据，接入追踪代码后访问你的网站
          </div>
        ) : (
          <div className="h-[320px]">
            <Line data={chartData} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
