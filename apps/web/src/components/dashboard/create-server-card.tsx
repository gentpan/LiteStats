"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CreateServerCard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    name: string;
    agentToken: string;
  } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreated(null);

    const response = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hostname }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("创建失败，请检查输入后重试");
      return;
    }

    const json = await response.json();
    setCreated({ name: json.server.name, agentToken: json.server.agentToken });
    setName("");
    setHostname("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>添加服务器</CardTitle>
        <CardDescription>生成 Agent Token，在目标 Linux 服务器安装探针上报 CPU / 内存 / 磁盘</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="名称，例如：生产主站" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="主机名，例如：167.233.97.16" value={hostname} onChange={(e) => setHostname(e.target.value)} required />
          <Button type="submit" disabled={loading} className="md:px-6">
            <Plus className="h-4 w-4" />
            {loading ? "创建中..." : "添加"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {created ? (
          <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-medium text-emerald-900">服务器「{created.name}」已创建</p>
            <div>
              <p className="text-emerald-800">Agent Token（请妥善保存）：</p>
              <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs">{created.agentToken}</code>
            </div>
            <div>
              <p className="text-emerald-800">安装探针（在目标服务器执行）：</p>
              <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-slate-700">{`curl -fsSL ${typeof window !== "undefined" ? window.location.origin : ""}/scripts/litestats-agent.sh -o /usr/local/bin/litestats-agent
chmod +x /usr/local/bin/litestats-agent
echo '*/1 * * * * LITESTATS_AGENT_TOKEN=${created.agentToken} LITESTATS_AGENT_ENDPOINT=${typeof window !== "undefined" ? window.location.origin : "https://litestats.dev"}/api/agent/metrics /usr/local/bin/litestats-agent' | crontab -`}</pre>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
