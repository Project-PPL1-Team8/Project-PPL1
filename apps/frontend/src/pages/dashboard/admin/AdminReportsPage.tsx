import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api";
import { downloadTextFile } from "./adminUtils";
import { toast } from "sonner";

const reports = [
  { label: "Users", endpoint: "/admin/export/users", filename: "users.csv" },
  { label: "Orders", endpoint: "/admin/export/orders", filename: "orders.csv" },
  { label: "Vouchers", endpoint: "/admin/export/vouchers", filename: "vouchers.csv" },
  { label: "Redemptions", endpoint: "/admin/export/redemptions", filename: "redemptions.csv" },
] as const;

export default function AdminReportsPage() {
  const handleExport = async (endpoint: string, filename: string) => {
    try {
      const payload = (await apiFetch(endpoint, { headers: { Accept: "text/csv" } })) as { detail?: string } | string;
      const csv = typeof payload === "string" ? payload : payload.detail || "";
      downloadTextFile(filename, csv, "text/csv");
      toast.success(`Berhasil export ${filename}`);
    } catch (err: any) {
      toast.error(err?.message || `Gagal export ${filename}`);
    }
  };

  return (
    <DashboardLayout title="Laporan & Ekspor" subtitle="Pusat export data admin untuk audit dan analitik.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-foreground mb-2">Export cepat</h3>
          <p className="text-sm text-muted-foreground mb-4">Gunakan endpoint backend admin yang sudah siap untuk download CSV.</p>
          <div className="flex flex-wrap gap-2">
            {reports.map((report) => (
              <Button key={report.filename} onClick={() => void handleExport(report.endpoint, report.filename)}>
                Export {report.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="font-semibold text-foreground mb-2">Backend sudah tersedia</h4>
            <p className="text-sm text-muted-foreground">
              Route admin backend yang bisa dipakai sekarang: stats, approvals user, review produk, donations, eligibility, dan export CSV.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="font-semibold text-foreground mb-2">Route frontend yang sudah disambungkan</h4>
            <p className="text-sm text-muted-foreground">
              /dashboard/admin, /dashboard/admin/users, /dashboard/admin/products, /dashboard/admin/beneficiaries, /dashboard/admin/donations,
              /dashboard/admin/orders, /dashboard/admin/vouchers, dan /dashboard/admin/reports.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}