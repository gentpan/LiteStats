import { PageHeader } from "@/components/dashboard/page-header";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { ChangePasswordCard } from "@/components/auth/change-password-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { listPasskeys } from "@/lib/passkey";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const passkeys = await listPasskeys(session.userId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="账户设置"
        description="管理登录方式、Passkey 设备与隐私策略。"
      />

      <PasskeySettings />
      <ChangePasswordCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
            <CardDescription>当前登录的管理员账户</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
              <span className="text-muted-foreground">用户名</span>
              <span className="font-medium">{session.username}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
              <span className="text-muted-foreground">用户 ID</span>
              <Badge className="font-mono">{session.userId.slice(0, 12)}...</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-3">
              <span className="text-muted-foreground">Passkey 数量</span>
              <span className="font-medium">{passkeys.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>认证安全</CardTitle>
            <CardDescription>LiteStats 登录安全机制</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="rounded-lg bg-muted/60 px-4 py-3">
                Passkey 使用 WebAuthn 标准，私钥保存在你的设备中，服务器只存储公钥
              </li>
              <li className="rounded-lg bg-muted/60 px-4 py-3">
                挑战值（Challenge）一次性使用，5 分钟内有效，防止重放攻击
              </li>
              <li className="rounded-lg bg-muted/60 px-4 py-3">
                密码登录仍然保留，可作为 Passkey 不可用时的备用方式
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>隐私与合规</CardTitle>
            <CardDescription>LiteStats 默认启用的隐私策略</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <li className="rounded-lg bg-muted/60 px-4 py-3">不存储原始 IP，仅用于生成匿名访客标识</li>
              <li className="rounded-lg bg-muted/60 px-4 py-3">不使用 Cookie 进行跨站追踪</li>
              <li className="rounded-lg bg-muted/60 px-4 py-3">所有统计数据由你自行托管与控制</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
