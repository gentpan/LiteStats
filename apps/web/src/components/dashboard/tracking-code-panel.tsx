"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TrackingCodePanelProps = {
  trackingId: string;
};

export function TrackingCodePanel({ trackingId }: TrackingCodePanelProps) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const snippet = `<script defer data-tracking-id="${trackingId}" src="${origin}/tracker.js"></script>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>追踪代码</CardTitle>
          <CardDescription className="mt-1">
            将以下脚本添加到网站 &lt;head&gt; 标签内，即可开始采集数据
          </CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={copySnippet}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "已复制" : "复制代码"}
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          {snippet}
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          自定义事件：<code className="rounded bg-muted px-1.5 py-0.5">window.litestats.track(&apos;signup&apos;)</code>
        </p>
      </CardContent>
    </Card>
  );
}
