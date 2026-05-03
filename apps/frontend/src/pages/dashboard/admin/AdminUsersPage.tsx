import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api";
import { formatDateTime, statusClass, shortId } from "./adminUtils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type UserRoleFilter = "all" | "user" | "beneficiary" | "donor" | "vendor";
type ApprovalFilter = "all" | "pending" | "approved" | "rejected";
type ApprovalStatus = "pending" | "approved" | "rejected";

type AdminUserItem = {
  user_id: string;
  full_name: string;
  role: "user" | "beneficiary" | "donor" | "vendor";
  approval_status: ApprovalStatus;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type AdminUserListResponse = {
  items: AdminUserItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

const roleTabs: Array<{ value: UserRoleFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "user", label: "User Biasa" },
  { value: "beneficiary", label: "Penerima" },
  { value: "donor", label: "Pendonor" },
  { value: "vendor", label: "Vendor" },
];

const statusTabs: Array<{ value: ApprovalFilter; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "pending", label: "Belum di-approve" },
  { value: "approved", label: "Sudah di-approve" },
  { value: "rejected", label: "Ditolak" },
];

const roleLabelMap: Record<Exclude<UserRoleFilter, "all">, string> = {
  user: "User Biasa",
  beneficiary: "Penerima",
  donor: "Pendonor",
  vendor: "Vendor",
};

type CountMap = Record<string, number>;

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [counts, setCounts] = useState<{ roles: CountMap; statuses: CountMap }>({ roles: {}, statuses: {} });
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ApprovalFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", "200");
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    return params.toString();
  }, [roleFilter, statusFilter, searchTerm]);

  const loadCounts = useCallback(async () => {
    try {
      const roleKeys: UserRoleFilter[] = ["all", "user", "beneficiary", "donor", "vendor"];
      const statusKeys: ApprovalFilter[] = ["all", "pending", "approved", "rejected"];

      const [roleResults, statusResults] = await Promise.all([
        Promise.all(
          roleKeys.map(async (role) => {
            const params = new URLSearchParams({ page: "1", page_size: "1" });
            if (role !== "all") params.set("role", role);
            const data = (await apiFetch(`/admin/users?${params.toString()}`)) as AdminUserListResponse;
            return [role, data.total || 0] as const;
          })
        ),
        Promise.all(
          statusKeys.map(async (status) => {
            const params = new URLSearchParams({ page: "1", page_size: "1" });
            if (status !== "all") params.set("status", status);
            const data = (await apiFetch(`/admin/users?${params.toString()}`)) as AdminUserListResponse;
            return [status, data.total || 0] as const;
          })
        ),
      ]);

      setCounts({
        roles: Object.fromEntries(roleResults),
        statuses: Object.fromEntries(statusResults),
      });
    } catch {
      setCounts({ roles: {}, statuses: {} });
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = (await apiFetch(`/admin/users?${queryString}`)) as AdminUserListResponse;
      setItems(data.items || []);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data pengguna");
      toast.error("Gagal memuat data pengguna");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void Promise.all([loadUsers(), loadCounts()]);
  }, [loadUsers, loadCounts]);

  const updateApproval = async (userId: string, approvalStatus: ApprovalStatus) => {
    try {
      setMutatingId(userId);
      await apiFetch(`/admin/users/${userId}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approval_status: approvalStatus }),
      });
      toast.success(`User berhasil di-${approvalStatus === "approved" ? "approve" : "reject"}`);
      await Promise.all([loadUsers(), loadCounts()]);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memperbarui approval");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <DashboardLayout title="Kelola Pengguna" subtitle="Pisahkan user biasa, pendonor, dan vendor. Approve akan menghilangkan user dari tab pending.">
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {roleTabs.map((tab) => (
              <Button
                key={tab.value}
                variant={roleFilter === tab.value ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter(tab.value)}
              >
                {tab.label}
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                  {counts.roles[tab.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <Button
                key={tab.value}
                variant={statusFilter === tab.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                  {counts.statuses[tab.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex min-w-[280px] flex-1 items-center gap-2">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Cari nama pengguna..."
              />
              <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
                Search
              </Button>
            </div>
            <Button variant="outline" onClick={() => void Promise.all([loadUsers(), loadCounts()])} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Memuat data pengguna...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Tidak ada user pada tab ini.
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <div key={item.user_id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">{item.full_name}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.approval_status)}`}>
                        {item.approval_status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {roleLabelMap[item.role]}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {shortId(item.user_id)} · dibuat {formatDateTime(item.created_at)}
                    </p>
                  </div>
                  {item.role === "beneficiary" || item.role === "vendor" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void updateApproval(item.user_id, "approved")}
                        disabled={mutatingId === item.user_id || item.approval_status === "approved"}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateApproval(item.user_id, "rejected")}
                        disabled={mutatingId === item.user_id || item.approval_status === "rejected"}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Akun ini tidak memiliki workflow approval.</div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="font-medium text-foreground mb-1">Kontak</div>
                    <p className="text-muted-foreground">{item.phone || "-"}</p>
                    <p className="text-muted-foreground">{item.address || "-"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="font-medium text-foreground mb-1">Status tab</div>
                    <p className="text-muted-foreground">Role: {roleLabelMap[item.role]}</p>
                    <p className="text-muted-foreground">Approval: {item.approval_status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
