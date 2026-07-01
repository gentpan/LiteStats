"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type DeleteWebsiteButtonProps = {
  websiteId: string;
  websiteName: string;
};

export function DeleteWebsiteButton({ websiteId, websiteName }: DeleteWebsiteButtonProps) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = await confirm({
      title: "删除站点",
      description: `确定删除「${websiteName}」？将同时删除该站点的统计数据、监控记录和追踪配置，此操作不可恢复。`,
      confirmLabel: "删除",
      destructive: true,
    });
    if (!confirmed) return;

    setLoading(true);
    const response = await fetch(`/api/websites/${websiteId}`, { method: "DELETE" });
    setLoading(false);

    if (!response.ok) {
      toast.error("删除失败，请稍后重试");
      return;
    }

    toast.success(`已删除站点「${websiteName}」`);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={handleDelete}
      className="text-red-600 hover:bg-red-50 hover:text-red-700"
      title="删除站点"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
