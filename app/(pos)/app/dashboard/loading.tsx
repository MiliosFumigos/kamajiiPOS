import { FullScreenLoading } from "@/components/ui/FullScreenLoading";

/** 伺服端頁面載入時顯示（與 Client 頁內的 FullScreenLoading 視覺一致） */
export default function DashboardLoading() {
  return (
    <FullScreenLoading
      open
      title="載入中"
      description="正在載入分店與 Kiosk 設定…"
    />
  );
}
