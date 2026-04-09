"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { FullScreenLoading } from "@/components/ui/FullScreenLoading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Role } from "@/lib/types";

const roleLabels: Record<string, string> = {
  OWNER: "品牌持有人",
  MANAGER: "分店長",
  STAFF: "店員",
};

type StaffItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
  storeName: string | null;
};

export default function AppStaffPage() {
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  const isOwner = session?.user?.role === Role.OWNER;
  const isManager = session?.user?.role === Role.MANAGER;

  const fetchStaff = async () => {
    setStaffLoading(true);
    setStaffError(null);
    try {
      const res = await fetch("/api/staff/list");
      const data = await res.json();
      if (!res.ok) {
        setStaffError(data.error || "取得員工列表失敗");
        setStaff([]);
      } else {
        setStaff(
          (data.users as StaffItem[]).map((u) => ({
            ...u,
            createdAt: u.createdAt,
          }))
        );
      }
    } catch {
      setStaffError("取得員工列表失敗，請稍後再試");
      setStaff([]);
    }
    setStaffLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const loadingOverlay = useMemo(() => {
    if (status === "loading") {
      return {
        open: true as const,
        title: "載入中",
        description: "正在確認登入狀態…",
      };
    }
    if (loading) {
      return {
        open: true as const,
        title: "處理中",
        description: "正在建立帳號…",
      };
    }
    if (staffLoading) {
      return {
        open: true as const,
        title: "載入中",
        description: "正在載入員工列表…",
      };
    }
    return {
      open: false as const,
      title: "",
      description: undefined as string | undefined,
    };
  }, [status, loading, staffLoading]);

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/manager/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, storeName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "建立失敗" });
        setLoading(false);
        return;
      }

      setMessage({ type: "success", text: "經理建立成功！" });
      setName("");
      setEmail("");
      setPassword("");
      setStoreName("");
      fetchStaff();
    } catch {
      setMessage({ type: "error", text: "建立失敗，請稍後再試" });
    }
    setLoading(false);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "建立失敗" });
        setLoading(false);
        return;
      }

      setMessage({ type: "success", text: "員工建立成功！" });
      setName("");
      setEmail("");
      setPassword("");
      fetchStaff();
    } catch {
      setMessage({ type: "error", text: "建立失敗，請稍後再試" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <FullScreenLoading
        open={loadingOverlay.open}
        title={loadingOverlay.title}
        description={loadingOverlay.description}
      />
      <h2 className="text-xl font-semibold text-slate-900">員工管理</h2>

      {isOwner && (
        <Card title="建立分店長">
          <p className="mb-4 text-sm text-slate-600">
            只有品牌持有人可以建立分店長
          </p>
          <form
            onSubmit={handleCreateManager}
            className="md:max-w-md space-y-4 md:mx-0"
          >
            <Input
              label="姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ｏ經理"
              required
            />
            <Input
              label="分店名稱"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="例如：台北一店"
              required
            />
            <Input
              label="電子信箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@example.com"
              required
            />
            <Input
              label="密碼"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 個字元"
              minLength={8}
              required
            />

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}
            <div className="flex justify-center md:justify-start">
              <Button type="submit" disabled={loading}>
                {loading ? "建立中..." : "建立分店長"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isManager && (
        <Card title="建立員工">
          <p className="mb-4 text-sm text-slate-600">
            您可以為此分店建立員工帳號
          </p>
          <form onSubmit={handleCreateStaff} className="md:max-w-md space-y-4">
            <Input
              label="姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新員工姓名"
              required
            />
            <Input
              label="電子信箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              required
            />
            <Input
              label="密碼"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 個字元"
              minLength={8}
              required
            />
            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}
            <div className="flex justify-center md:justify-start">
              <Button type="submit" disabled={loading}>
                {loading ? "建立中..." : "建立員工"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!isOwner && !isManager && (
        <Card>
          <p className="text-slate-600">
            您目前的角色為{" "}
            {roleLabels[session?.user?.role || ""] || session?.user?.role}
            ，僅品牌持有人與分店長可建立帳號。
          </p>
        </Card>
      )}

      <Card title="員工列表">
        {staffLoading && <p className="text-sm text-slate-500">載入中...</p>}
        {staffError && <p className="text-sm text-red-600">{staffError}</p>}
        {!staffLoading && !staffError && staff.length === 0 && (
          <p className="text-sm text-slate-500">目前尚無員工。</p>
        )}
        <div className="mt-2 space-y-2">
          {staff.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
            >
              <div>
                <p className="font-medium">{user.name || "(未填姓名)"}</p>
                <p className="text-sm text-slate-600">{user.email}</p>
                {user.storeName && (
                  <p className="text-xs text-slate-500">
                    分店：{user.storeName}
                  </p>
                )}
              </div>
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                {roleLabels[user.role] || user.role}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
