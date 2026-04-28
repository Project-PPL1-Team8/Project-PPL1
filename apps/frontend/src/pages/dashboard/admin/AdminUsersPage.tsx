import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api";
import { formatDateTime, statusClass, shortId } from "./adminUtils";
import { toast } from "sonner";

type ApprovalRole = "beneficiary" | "vendor";
type ApprovalStatus = "pending" | "approved" | "rejected";

type AdminUserApprovalItem = {
  user_id: string;
  full_name: string;
  role: ApprovalRole;
  approval_status: ApprovalStatus;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at?: string | null;
  family_size?: number | null;
  vouchers_balance?: string | number | null;
  latest_fies_score?: number | null;
  latest_fies_classification?: string | null;
  latest_survey_date?: string | null;
  store_name?: string | null;
  store_address?: string | null;
};

type AdminUserApprovalListResponse = {
  items: AdminUserApprovalItem[];
  total: number;
};

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUserApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = (await apiFetch("/admin/users/approvals?page=1&page_size=50")) as AdminUserApprovalListResponse;
      setItems(data.items || []);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data user admin");
      toast.error("Gagal memuat data user admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const updateApproval = async (userId: string, approvalStatus: ApprovalStatus) => {
    try {
      setMutatingId(userId);
      await apiFetch(`/admin/users/${userId}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approval_status: approvalStatus }),
      });
      toast.success(`User berhasil di-${approvalStatus === "approved" ? "approve" : "reject"}`);
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message || "Gagal memperbarui approval");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <DashboardLayout title="Kelola Pengguna" subtitle="Approve atau reject akun beneficiary dan vendor.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Total akun menunggu review dan akun yang sudah diproses.</p>
          </div>
          <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
            Refresh
          </Button>
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
            Tidak ada akun yang perlu direview.
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
                        {item.role}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{shortId(item.user_id)} · dibuat {formatDateTime(item.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void updateApproval(item.user_id, "approved")}
                      disabled={mutatingId === item.user_id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateApproval(item.user_id, "rejected")}
                      disabled={mutatingId === item.user_id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="font-medium text-foreground mb-1">Kontak</div>
                    <p className="text-muted-foreground">{item.phone || "-"}</p>
                    <p className="text-muted-foreground">{item.address || "-"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="font-medium text-foreground mb-1">Detail role</div>
                    {item.role === "beneficiary" ? (
                      <div className="space-y-1 text-muted-foreground">
                        <p>Family size: {item.family_size ?? "-"}</p>
                        <p>Voucher balance: {item.vouchers_balance ?? 0}</p>
                        <p>
                          FIES: {item.latest_fies_score ?? "-"} / {item.latest_fies_classification || "-"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 text-muted-foreground">
                        <p>Store: {item.store_name || "-"}</p>
                        <p>Store address: {item.store_address || "-"}</p>
                      </div>
                    )}
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