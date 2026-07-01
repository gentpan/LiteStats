import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppSidebar, MobileNav } from "@/components/dashboard/app-sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const websites = await prisma.website.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, domain: true },
  });

  return (
    <>
      <link
        rel="stylesheet"
        href="https://static.bluecdn.com/libs/fontawesome/7.3.0/css/all.min.css"
        crossOrigin="anonymous"
      />
      <div className="flex min-h-screen bg-background">
        <div className="hidden lg:flex">
          <AppSidebar username={session.username} websites={websites} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur lg:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Analytics Console
              </p>
              <p className="text-sm font-medium text-foreground">LiteStats 管理后台</p>
            </div>
            <UserMenu />
          </header>

          <MobileNav websites={websites} />

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </>
  );
}
