import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Download,
  ArrowRight,
  Wallet,
  Calendar,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { formatIDR, formatDate } from "@/lib/format";
import { requestSettlementPayout, exportSettlements } from "@/services/settlements";
import type { Settlement } from "@/services/settlements";
import { triggerDownload } from "@/services/downloads";
import type { SettlementReport } from "@/services/reports";
import { getSettlementReport } from "@/services/reports";
import { apiFetch } from "@/services/api";
import { toast } from "sonner";
import { useVendorSettlement } from "@/hooks/useVendorSettlement";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { CardSkeletonGrid } from "@/components/dashboard/LoadingSkeleton";
import { KpiCard, KpiCardGrid } from "@/components/dashboard/KpiCard";
import { settlementStatusConfig } from "@/lib/status-config";

interface VendorProfile {
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
}

const VendorSettlement = () => {
  const { user } = useAuth();
  const { data: settlements, loading, error, refetch } = useVendorSettlement();

  const [report, setReport] = useState<SettlementReport | null>(null);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Fetch settlement report separately (for analytics)
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    getSettlementReport(startDate, endDate)
      .then(setReport)
      .catch(() => {}); // non-critical, dashboard still works without it
    return () => controller.abort();
  }, [startDate, endDate, user]);

  // Fetch vendor profile (for bank info)
  const fetchVendorProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiFetch(`/users/${user.id}`);
      setVendorProfile(data as VendorProfile);
    } catch {
      // Non-critical, fallback to placeholder
    }
  }, [user?.id]);

  useEffect(() => {
    fetchVendorProfile();
  }, [fetchVendorProfile]);

  const totalEarned = useMemo(() => {
    if (report?.summary?.settled_amount) return report.summary.settled_amount;
    return settlements
      .filter((s) => s.status === "paid" || s.status === "ready")
      .reduce((a, b) => a + (b.net_amount || 0), 0);
  }, [report, settlements]);

  const pendingCount = useMemo(() => {
    if (report) return report.summary.pending_count;
    return settlements.filter((s) => s.status === "ready" || s.status === "pending").length;
  }, [report, settlements]);

  const pendingTotal = useMemo(() => {
    if (report?.summary?.pending_amount) return report.summary.pending_amount;
    return settlements
      .filter((s) => s.status === "ready" || s.status === "pending")
      .reduce((a, b) => a + (b.net_amount || 0), 0);
  }, [report, settlements]);

  const handleClaim = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setShowClaimModal(true);
  };

  const handleClaimSubmit = async () => {
    if (!selectedSettlement) return;
    try {
      setClaimLoading(true);
      await requestSettlementPayout(selectedSettlement.id);
      toast.success(
        `Pencairan ${formatIDR(selectedSettlement.net_amount || 0)} diproses dalam 1-3 hari kerja.`
      );
      setShowClaimModal(false);
      setSelectedSettlement(null);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengajukan klaim";
      toast.error(msg);
    } finally {
      setClaimLoading(false);
    }
  };

  const handleExport = async () => {
    if (settlements.length === 0) {
      toast.info("Tidak ada data untuk diekspor");
      return;
    }

    setExportLoading(true);
    try {
      const blob = await exportSettlements("csv", startDate, endDate);
      const dateStr = new Date().toISOString().split("T")[0];
      triggerDownload(blob, `laporan-settlement-${dateStr}.csv`);
      toast.success("Laporan berhasil diunduh");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengekspor laporan";
      toast.error(msg);
    } finally {
      setExportLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="Riwayat Pencairan"
        subtitle="Riwayat pencairan dana voucher yang telah ditukarkan."
      >
        <div className="space-y-4">
          <CardSkeletonGrid count={4} columns={4} />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout
        title="Riwayat Pencairan"
        subtitle="Riwayat pencairan dana voucher yang telah ditukarkan."
      >
        <ErrorState message={error} onRetry={refetch} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Riwayat Pencairan"
      subtitle="Riwayat pencairan dana voucher yang telah ditukarkan."
    >
      <div className="space-y-5">
        {/* KPI Cards */}
        <KpiCardGrid columns={4}>
          <KpiCard
            icon={Wallet}
            label="Total Dicairkan"
            value={formatIDR(totalEarned)}
            subtitle={`${settlements.filter((s) => s.status === "paid").length} periode`}
            variant="green"
          />
          <KpiCard
            icon={Calendar}
            label="Menunggu Cair"
            value={formatIDR(pendingTotal)}
            subtitle={`${pendingCount} periode`}
            variant="amber"
          />
          <KpiCard
            icon={CreditCard}
            label="Rekening Tujuan"
            value={vendorProfile?.bank_name || "Belum diatur"}
            subtitle={
              vendorProfile?.bank_account_number
                ? `****${vendorProfile.bank_account_number.slice(-4)}`
                : "Silakan lengkapi di profil"
            }
            variant={vendorProfile?.bank_account_number ? "indigo" : "red"}
          />
          <KpiCard
            icon={Calendar}
            label="Jadwal Cair"
            value="Tgl 5"
            subtitle="Setiap bulan"
            variant="purple"
          />
        </KpiCardGrid>

        {/* Trend Cards (if report available) */}
        {report && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[
              {
                label: "Pertumbuhan Bulanan",
                value: `${report.trends.month_over_month_growth > 0 ? "+" : ""}${report.trends.month_over_month_growth.toFixed(1)}%`,
                icon: TrendingUp,
                positive: report.trends.month_over_month_growth >= 0,
              },
              {
                label: "Rata-rata Waktu Cair",
                value: `${report.trends.average_settlement_time.toFixed(1)} hari`,
                icon: Calendar,
                positive: true,
              },
              {
                label: "Tingkat Sukses",
                value: `${report.trends.settlement_success_rate.toFixed(1)}%`,
                icon: TrendingUp,
                positive: true,
              },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.label}
                  className={`rounded-xl border p-4 flex items-center gap-3 ${t.positive ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white ${t.positive ? "border-green-200" : "border-red-200"}`}
                  >
                    <Icon className={`h-4 w-4 ${t.positive ? "text-green-600" : "text-red-600"}`} />
                  </div>
                  <div>
                    <div
                      className={`text-lg font-extrabold ${t.positive ? "text-green-700" : "text-red-700"}`}
                    >
                      {t.value}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Date Filter + Download */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Dari</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-input bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Sampai</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-input bg-card px-3 py-2 text-sm"
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={exportLoading || settlements.length === 0}
          >
            {exportLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Unduh Laporan
          </Button>
        </div>

        {/* Settlement List */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Riwayat Pencairan</h2>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {settlements.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
                  <CreditCard className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-semibold text-foreground mb-1">Belum ada settlement</p>
                <p className="text-sm text-muted-foreground">
                  Settlement muncul setelah ada penukaran voucher
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {settlements.map((s) => {
                  const sc =
                    settlementStatusConfig[s.status as keyof typeof settlementStatusConfig] ||
                    settlementStatusConfig.calculating;
                  const SCIcon = sc.icon;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors"
                    >
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                          s.status === "paid"
                            ? "bg-blue-50"
                            : s.status === "ready"
                              ? "bg-green-50"
                              : "bg-amber-50"
                        }`}
                      >
                        <SCIcon
                          className={`h-4 w-4 ${
                            s.status === "paid"
                              ? "text-blue-600"
                              : s.status === "ready"
                                ? "text-green-600"
                                : "text-amber-600"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {s.period_start ? formatDate(s.period_start) : "—"} —{" "}
                          {s.period_end ? formatDate(s.period_end) : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.vendor_store_name || "Toko Anda"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-foreground">
                          {formatIDR(s.net_amount || 0)}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] border gap-0.5 ${sc.className}`}
                        >
                          <SCIcon className="h-2.5 w-2.5" /> {sc.label}
                        </Badge>
                      </div>
                      {s.status === "ready" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 flex-shrink-0 border-green-200 text-green-700 hover:bg-green-50"
                          onClick={() => handleClaim(s)}
                        >
                          <ArrowRight className="h-3 w-3" /> Klaim
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Claim Modal */}
      <Dialog open={showClaimModal} onOpenChange={setShowClaimModal}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Klaim Settlement</DialogTitle>
            <DialogDescription>
              Ajukan pencairan dana untuk periode{" "}
              {selectedSettlement?.period_start ? formatDate(selectedSettlement.period_start) : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2.5 text-sm">
              {[
                {
                  label: "Periode",
                  value: `${selectedSettlement?.period_start ? formatDate(selectedSettlement.period_start) : "—"} s/d ${selectedSettlement?.period_end ? formatDate(selectedSettlement.period_end) : "—"}`,
                },
                {
                  label: "Total Redemptions",
                  value: formatIDR(selectedSettlement?.total_redemptions || 0),
                },
                {
                  label: "Admin Fee",
                  value: formatIDR(selectedSettlement?.admin_fee || 0),
                },
              ].map((r) => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-muted-foreground">{r.label}:</span>
                  <span className="font-medium">{r.value}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2.5">
                <span className="font-semibold text-foreground">Jumlah Bersih:</span>
                <span className="font-bold text-green-600">
                  {formatIDR(selectedSettlement?.net_amount || 0)}
                </span>
              </div>
            </div>
            <Button
              className="w-full h-11 bg-green-600 hover:bg-green-700"
              onClick={handleClaimSubmit}
              disabled={claimLoading}
            >
              {claimLoading ? "Memproses..." : "Ajukan Klaim Sekarang"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setShowClaimModal(false)}>
              Batal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default VendorSettlement;
