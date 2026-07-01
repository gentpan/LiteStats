"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasskeyLogin } from "@/components/auth/passkey-login";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("litestats");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!response.ok) {
      setError("用户名或密码错误");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-950 px-12 py-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold">LiteStats</p>
              <p className="text-sm text-slate-400">Privacy-first Analytics</p>
            </div>
          </div>

          <div className="mt-20 max-w-md">
            <h1 className="text-4xl font-semibold tracking-tight">专业、简洁的网站统计后台</h1>
            <p className="mt-4 text-base leading-7 text-slate-400">
              支持密码与 Passkey 双模式登录。Passkey 基于 WebAuthn 标准，安全且无需记忆密码。
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            "WebAuthn / Passkey 无密码登录",
            "Touch ID、Face ID、安全密钥全面支持",
            "数据完全由你掌控，支持自托管",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              {item}
            </div>
          ))}
        </div>

        <div className="absolute -right-16 top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-6">
          <div className="mb-2 lg:hidden">
            <p className="text-sm font-semibold text-emerald-700">LiteStats</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">登录管理后台</h1>
          </div>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-xl">Passkey 登录</CardTitle>
              <CardDescription>推荐使用生物识别或安全密钥快速登录</CardDescription>
            </CardHeader>
            <CardContent>
              <PasskeyLogin defaultUsername={username} />
            </CardContent>
          </Card>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">或使用密码</span>
            </div>
          </div>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-xl">密码登录</CardTitle>
              <CardDescription>首次使用请用默认账户登录并注册 Passkey</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">用户名</span>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium text-foreground">密码</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "登录中..." : "密码登录"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
              <p className="mt-4 text-xs text-muted-foreground">默认账号：admin / litestats</p>
            </CardContent>
          </Card>

          <Link href="/" className="inline-flex text-sm text-muted-foreground hover:text-foreground">
            返回官网首页
          </Link>
        </div>
      </div>
    </div>
  );
}
