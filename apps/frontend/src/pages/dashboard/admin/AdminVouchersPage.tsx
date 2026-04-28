import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { downloadTextFile, formatDateTime } from "./adminUtils";
import { toast } from "sonner";

type AdminStatsResponse = {
  vouchers: { active_count: number; total_balance: number };
  redemptions: { total_count: number; total_amount: number };
};

export default function AdminVouchersPage() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiFetch("/admin/stats")) as AdminStatsResponse;
      setStats(data);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memuat statistik voucher");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const exportCsv = async (endpoint: string, filename: string) => {
    try {
      setExporting(filename);
      const payload = (await apiFetch(endpoint, { headers: { Accept: "text/csv" } })) as { detail?: string } | string;
      const csv = typeof payload === "string" ? payload : payload.detail || "";
      downloadTextFile(filename, csv, "text/csv");
      toast.success(`Berhasil export ${filename}`);
    } catch (err: any) {
      toast.error(err?.message || `Gagal export ${filename}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DashboardLayout title="Kelola Voucher" subtitle="Ringkasan voucher aktif dan export data voucher/redemption.">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Voucher admin belum punya list khusus, jadi halaman ini menampilkan statistik dan export backend yang sudah ada.
          </p>
          <Button variant="outline" onClick={() => void loadStats()} disabled={loading}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voucher aktif</p>
            <div className="mt-2 text-3xl font-extrabold text-foreground">{loading ? "-" : stats?.vouchers.active_count ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo voucher</p>
            <div className="mt-2 text-3xl font-extrabold text-foreground">{loading ? "-" : formatIDR(stats?.vouchers.total_balance || 0)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Redemptions</p>
            <div className="mt-2 text-3xl font-extrabold text-foreground">{loading ? "-" : stats?.redemptions.total_count ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total redemption</p>
            <div className="mt-2 text-3xl font-extrabold text-foreground">{loading ? "-" : formatIDR(stats?.redemptions.total_amount || 0)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Export Data</h3>
            <p className="text-sm text-muted-foreground">Download CSV dari backend admin yang sudah tersedia.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void exportCsv("/admin/export/users", "users.csv")} disabled={Boolean(exporting)}>
              Export Users
            </Button>
            <Button variant="outline" onClick={() => void exportCsv("/admin/export/orders", "orders.csv")} disabled={Boolean(exporting)}>
              Export Orders
            </Button>
            <Button variant="outline" onClick={() => void exportCsv("/admin/export/vouchers", "vouchers.csv")} disabled={Boolean(exporting)}>
              Export Vouchers
            </Button>
            <Button variant="outline" onClick={() => void exportCsv("/admin/export/redemptions", "redemptions.csv")} disabled={Boolean(exporting)}>
              Export Redemptions
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Terakhir dimuat: {formatDateTime(new Date())}
        </div>
      </div>
    </DashboardLayout>
  );
}