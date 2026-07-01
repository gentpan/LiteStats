"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { AlertCircle, CheckCircle2, Fingerprint, Info, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasskeyLoginProps = {
  defaultUsername?: string;
};

type PasskeyStatus = {
  userExists: boolean | null;
  hasPasskeys: boolean;
  passkeyCount: number;
  hint: "ready" | "register_first" | "user_not_found" | "discoverable";
};

export function PasskeyLogin({ defaultUsername = "" }: PasskeyLoginProps) {
  const router = useRouter();
  const [username, setUsername] = useState(defaultUsername);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<PasskeyStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  useEffect(() => {
    if (!supported) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCheckingStatus(true);
      try {
        const response = await fetch("/api/auth/passkey/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(username.trim() ? { username: username.trim() } : {}),
          signal: controller.signal,
        });

        if (response.ok) {
          setStatus(await response.json());
        }
      } catch {
        // ignore aborted requests
      } finally {
        setCheckingStatus(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [username, supported]);

  async function loginWithPasskey(mode: "discoverable" | "username") {
    setLoading(true);
    setError("");

    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "username" && username.trim() ? { username: username.trim() } : {},
        ),
      });

      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setError(optionsPayload.error ?? "无法开始 Passkey 登录");
        return;
      }

      const authenticationResponse = await startAuthentication({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authenticationResponse }),
      });

      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok) {
        setError(verifyPayload.error ?? "Passkey 验证失败");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "NotAllowedError") {
        setError("已取消 Passkey 验证");
      } else {
        setError("Passkey 登录失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        当前浏览器不支持 WebAuthn / Passkey，请使用密码登录。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusBanner status={status} checking={checkingStatus} username={username} />

      <label className="block space-y-2 text-sm">
        <span className="font-medium text-foreground">用户名（可选）</span>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="留空则使用系统 Passkey 选择器"
          autoComplete="username webauthn"
        />
      </label>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading || shouldDisableDiscoverable(status, username)}
          onClick={() => loginWithPasskey("discoverable")}
        >
          <Fingerprint className="h-4 w-4" />
          {loading ? "验证中..." : "使用 Passkey 登录"}
        </Button>

        {username.trim() ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={loading || status?.hint === "user_not_found" || status?.hint === "register_first"}
            onClick={() => loginWithPasskey("username")}
          >
            <KeyRound className="h-4 w-4" />
            使用「{username.trim()}」的 Passkey
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function shouldDisableDiscoverable(status: PasskeyStatus | null, username: string) {
  if (username.trim()) {
    return status?.hint === "user_not_found" || status?.hint === "register_first";
  }
  return status?.hint === "register_first" && status.passkeyCount === 0;
}

function StatusBanner({
  status,
  checking,
  username,
}: {
  status: PasskeyStatus | null;
  checking: boolean;
  username: string;
}) {
  if (checking && !status) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        正在检查 Passkey 状态...
      </div>
    );
  }

  if (!status) return null;

  if (status.hint === "user_not_found") {
    return (
      <HintBox
        tone="warning"
        icon={AlertCircle}
        title="用户不存在"
        description="请检查用户名，或改用密码登录创建账户后再注册 Passkey。"
      />
    );
  }

  if (status.hint === "register_first" && username.trim()) {
    return (
      <HintBox
        tone="info"
        icon={Info}
        title="该账户尚未注册 Passkey"
        description={
          <>
            请先用密码登录，然后在{" "}
            <Link href="/dashboard/settings" className="font-medium text-emerald-700 underline">
              账户设置
            </Link>{" "}
            中注册 Passkey。
          </>
        }
      />
    );
  }

  if (status.hint === "register_first" && !username.trim()) {
    return (
      <HintBox
        tone="info"
        icon={Info}
        title="系统中尚无 Passkey"
        description="首次使用请用下方密码登录（admin / litestats），然后在设置页注册 Passkey。"
      />
    );
  }

  if (status.hint === "ready") {
    return (
      <HintBox
        tone="success"
        icon={CheckCircle2}
        title={`已注册 ${status.passkeyCount} 个 Passkey`}
        description="可以使用生物识别或安全密钥快速登录。"
      />
    );
  }

  if (status.hint === "discoverable" && status.hasPasskeys) {
    return (
      <HintBox
        tone="success"
        icon={CheckCircle2}
        title="检测到可用 Passkey"
        description="可直接点击按钮，在系统弹窗中选择你的 Passkey。"
      />
    );
  }

  return null;
}

function HintBox({
  tone,
  icon: Icon,
  title,
  description,
}: {
  tone: "info" | "warning" | "success";
  icon: typeof Info;
  title: string;
  description: ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", styles[tone])}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-[13px] opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
}
