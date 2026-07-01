"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PasskeyItem = {
  id: string;
  deviceName: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export function PasskeySettings() {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState("我的 MacBook");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/auth/passkey");
    if (response.ok) {
      const data = await response.json();
      setPasskeys(data.passkeys);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    loadPasskeys();
  }, [loadPasskeys]);

  async function registerPasskey(event: FormEvent) {
    event.preventDefault();
    setRegistering(true);
    setError("");

    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName }),
      });

      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setError(optionsPayload.error ?? "无法创建注册选项");
        return;
      }

      const registrationResponse = await startRegistration({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: registrationResponse,
          deviceName: optionsPayload.deviceName ?? deviceName,
        }),
      });

      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok) {
        setError(verifyPayload.error ?? "Passkey 注册失败");
        return;
      }

      setDeviceName("我的设备");
      await loadPasskeys();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "NotAllowedError") {
        setError("已取消 Passkey 注册");
      } else {
        setError("Passkey 注册失败，请重试");
      }
    } finally {
      setRegistering(false);
    }
  }

  async function deletePasskey(id: string, name: string) {
    const confirmed = await confirm({
      title: "删除 Passkey",
      description: `确定删除「${name}」？删除后将无法使用该设备通过生物识别登录。`,
      confirmLabel: "删除",
      destructive: true,
    });
    if (!confirmed) return;

    const response = await fetch(`/api/auth/passkey/${id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("删除失败，请稍后重试");
      return;
    }

    toast.success(`已删除 Passkey「${name}」`);
    await loadPasskeys();
  }

  async function saveRename(id: string) {
    const response = await fetch(`/api/auth/passkey/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: editingName }),
    });

    if (!response.ok) {
      setError("重命名失败");
      return;
    }

    setEditingId(null);
    setEditingName("");
    await loadPasskeys();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4" />
          Passkey 无密码登录
        </CardTitle>
        <CardDescription>
          注册 Passkey 后，可使用生物识别或安全密钥快速登录，无需输入密码。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!supported ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前浏览器不支持 WebAuthn，无法注册 Passkey。
          </div>
        ) : (
          <form onSubmit={registerPasskey} className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 md:flex-row md:items-end">
            <label className="flex-1 space-y-2 text-sm">
              <span className="font-medium">设备名称</span>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="例如：Peter 的 MacBook"
                required
              />
            </label>
            <Button type="submit" disabled={registering}>
              <Plus className="h-4 w-4" />
              {registering ? "注册中..." : "注册新 Passkey"}
            </Button>
          </form>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">已注册的 Passkey</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : passkeys.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              尚未注册 Passkey。注册后可在此管理设备。
            </div>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {editingId === passkey.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                        />
                        <Button size="sm" onClick={() => saveRename(passkey.id)}>
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          取消
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{passkey.deviceName}</p>
                          {passkey.backedUp ? <Badge>已同步</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          创建于 {formatDate(passkey.createdAt)}
                          {passkey.lastUsedAt ? ` · 最近使用 ${formatDate(passkey.lastUsedAt)}` : ""}
                        </p>
                        {passkey.transports.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            传输：{passkey.transports.join(", ")}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  {editingId !== passkey.id ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(passkey.id);
                          setEditingName(passkey.deviceName);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        重命名
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn("text-red-600 hover:text-red-700")}
                        onClick={() => deletePasskey(passkey.id, passkey.deviceName)}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
