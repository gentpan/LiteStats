"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CreateWebsiteCard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, domain }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("创建失败，请检查输入后重试");
      return;
    }

    setName("");
    setDomain("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>添加新站点</CardTitle>
        <CardDescription>创建站点后自动启用 Uptime 与 SSL 监控，并生成独立追踪 ID</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="站点名称，例如：我的博客" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="域名，例如：example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
          <Button type="submit" disabled={loading} className="md:px-6">
            <Plus className="h-4 w-4" />
            {loading ? "创建中..." : "创建站点"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
