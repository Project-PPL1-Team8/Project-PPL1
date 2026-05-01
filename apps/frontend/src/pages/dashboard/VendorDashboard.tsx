import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import {
  Store,
  Wallet,
  Package,
  BarChart3,
  QrCode,
  ArrowRight,
  ArrowDownToLine,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { formatIDR, formatDate } from "@/lib/format";
import { updateOrderStatus } from "@/services/orders";
import { getSalesReport } from "@/services/reports";
import { requestWithdrawal } from "@/services/vendor-wallet";
import { toast } from "sonner";
import { useVendorData } from "@/hooks/useVendorData";
import { useSmartPolling } from "@/hooks/useSmartPolling";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { KpiCard, KpiCardGrid } from "@/components/dashboard/KpiCard";
import { orderStatusConfig } from "@/lib/status-config";

const MIN_WITHDRAWAL = 50000;

export default function VendorDashboard() {
  const { user } = useAuth();

  const {
    data: { orders, products, wallet },
    loading,
    error,
    refetch,
    refetchOrders,
  } = useVendorData();

  // Polling every 30s as per original design
  useSmartPolling(refetchOrders, { interval: 30000, enabled: !!user });

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [totalSalesFromReport, setTotalSalesFromReport] = useState<number>(0);

  // Fetch report data for revenue
  useSmartPolling(
    async () => {
      if (!user) return;
      try {
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const reportData = await getSalesReport(startDate, endDate);
        if (reportData?.summary?.total_sales) {
          setTotalSalesFromReport(reportData.summary.total_sales);
        }
      } catch {
        // Ignore report errors to not break dashboard
      }
    },
    { interval: 60000, enabled: !!user }
  );

  const totalRevenue = useMemo(() => {
    if (totalSalesFromReport > 0) return totalSalesFromReport;
    return orders
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + parseFloat(String(o.total_amount) || "0"), 0);
  }, [totalSalesFromReport, orders]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.approval_status === "approved").length,
    [products]
  );
  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  const handleStatusUpdate = useCallback(
    async (orderId: string, status: "completed" | "cancelled") => {
      try {
        await updateOrderStatus(orderId, status);
        toast.success(`Pesanan ${status === "completed" ? "diselesaikan" : "dibatalkan"}`);
        refetchOrders();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memperbarui status";
        toast.error(msg);
      }
    },
    [refetchOrders]
  );

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
      toast.error(`Minimum penarikan Rp ${MIN_WITHDRAWAL.toLocaleString("id-ID")}`);
      return;
    }
    const currentBalance = wallet?.balance || 0;
    if (amount > currentBalance) {
      toast.error("Saldo tidak mencukupi");
      return;
    }
    try {
      setWithdrawLoading(true);
      await requestWithdrawal(amount);
      toast.success(`Penarikan Rp ${amount.toLocaleString("id-ID")} berhasil diproses`);
      setWithdrawModalOpen(false);
      setWithdrawAmount("");
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses penarikan";
      toast.error(msg);
    } finally {
      setWithdrawLoading(false);
    }
  }, [withdrawAmount, wallet, refetch]);

  if (loading) {
    return (
      <DashboardLayout title="Dashboard Vendor" subtitle="Memuat data toko Anda...">
        <PageSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Dashboard Vendor" subtitle="Kelola produk dan penukaran voucher.">
        <ErrorState message={error} onRetry={refetch} />
      </DashboardLayout>
    );
  }

  const walletBalance = wallet?.balance || 0;

  return (
    <DashboardLayout
      title={`Toko ${user?.fullName || "Vendor"} `}
      subtitle="Kelola produk, pesanan, dan saldo toko Anda."
    >
      <div className="space-y-6">
        {/* Wallet Hero Card */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #6d28d9 100%)" }}
        >
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute right-8 bottom-0 h-16 w-16 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-indigo-200" />
                <p className="text-sm text-indigo-100 font-medium">Saldo E-Wallet Toko</p>
              </div>
              <div className="text-3xl font-extrabold text-white tracking-tight mb-2">
                {formatIDR(walletBalance)}
              </div>
              <p className="text-xs text-indigo-200">
                Minimum penarikan:{" "}
                <strong className="text-white">{formatIDR(MIN_WITHDRAWAL)}</strong>
              </p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button
                size="sm"
                className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold gap-1.5"
                onClick={() => setWithdrawModalOpen(true)}
                disabled={walletBalance < MIN_WITHDRAWAL}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" /> Tarik Dana
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 font-semibold gap-1.5"
                asChild
              >
                <Link to="/dashboard/penukaran-voucher">
                  <QrCode className="h-3.5 w-3.5" /> Tukar Voucher
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <KpiCardGrid columns={4}>
          <KpiCard
            icon={Store}
            label="Total Pesanan"
            value={orders.length.toString()}
            subtitle={`${pendingOrders} pending`}
            variant="indigo"
          />
          <KpiCard
            icon={TrendingUp}
            label="Pendapatan Bulan Ini"
            value={formatIDR(totalRevenue)}
            subtitle="Periode 30 hari"
            variant="green"
          />
          <KpiCard
            icon={Package}
            label="Produk Aktif"
            value={activeProducts.toString()}
            subtitle={`dari ${products.length} produk`}
            variant="orange"
          />
          <KpiCard
            icon={BarChart3}
            label="Status Pencairan"
            value={orders.length > 0 ? "Aktif" : "-"}
            subtitle="Periode berjalan"
            variant="purple"
          />
        </KpiCardGrid>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Recent Orders */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Pesanan Terbaru</h2>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" asChild>
                <Link to="/dashboard/penukaran-voucher">
                  Semua <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {orders.length === 0 ? (
                <div className="text-center py-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 mx-auto mb-3">
                    <Store className="h-5 w-5 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Belum ada pesanan</p>
                  <p className="text-xs text-muted-foreground">
                    Pesanan voucher penerima akan muncul di sini
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {orders.slice(0, 6).map((o) => {
                    const s = orderStatusConfig[o.status] || orderStatusConfig.pending;
                    const StatusIcon = s.icon;
                    return (
                      <div
                        key={o.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50">
                          <Store className="h-4 w-4 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-foreground">
                            #{o.id.slice(0, 8)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatDate(o.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-foreground">
                            {formatIDR(o.total_amount)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] border ${s.className} gap-0.5`}
                          >
                            <StatusIcon className="h-2.5 w-2.5" />
                            {s.label}
                          </Badge>
                        </div>
                        {o.status === "pending" && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleStatusUpdate(o.id, "completed")}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors text-sm font-bold"
                              title="Selesaikan"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(o.id, "cancelled")}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-sm font-bold"
                              title="Batalkan"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground mb-3">Menu Vendor</h2>
            <div className="space-y-2">
              {[
                {
                  label: "Pindai & Tukar Voucher",
                  desc: "Verifikasi voucher penerima",
                  icon: QrCode,
                  href: "/dashboard/penukaran-voucher",
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  border: "border-indigo-200",
                  primary: true,
                },
                {
                  label: "Kelola Produk",
                  desc: "Tambah & edit produk toko",
                  icon: Package,
                  href: "/dashboard/kelola-produk",
                  color: "text-orange-600",
                  bg: "bg-orange-50",
                  border: "border-orange-200",
                  primary: false,
                },
                {
                  label: "Riwayat Pencairan",
                  desc: "Riwayat pencairan dana",
                  icon: BarChart3,
                  href: "/dashboard/settlement",
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  border: "border-purple-200",
                  primary: false,
                },
                {
                  label: "Tarik Dana",
                  desc: `Saldo: ${formatIDR(walletBalance)}`,
                  icon: ArrowDownToLine,
                  href: "#",
                  color: "text-green-600",
                  bg: "bg-green-50",
                  border: "border-green-200",
                  primary: false,
                  onClick: () => setWithdrawModalOpen(true),
                },
              ].map((action) => {
                const ActionIcon = action.icon;
                const content = (
                  <div
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm group ${action.border} ${action.primary ? action.bg : "bg-card"}`}
                  >
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${action.bg} border ${action.border}`}
                    >
                      <ActionIcon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{action.label}</div>
                      <div className="text-xs text-muted-foreground">{action.desc}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  </div>
                );
                if (action.onClick) {
                  return (
                    <button
                      key={action.label}
                      className="w-full text-left"
                      onClick={action.onClick}
                    >
                      {content}
                    </button>
                  );
                }
                return (
                  <Link key={action.label} to={action.href}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Withdrawal Modal */}
      <Dialog open={withdrawModalOpen} onOpenChange={setWithdrawModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tarik Dana ke Rekening</DialogTitle>
            <DialogDescription>
              Minimum penarikan Rp {MIN_WITHDRAWAL.toLocaleString("id-ID")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo Tersedia:</span>
                <span className="font-bold text-foreground">{formatIDR(walletBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rekening Tujuan:</span>
                <span className="font-medium text-muted-foreground">Lihat di Profil</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">
                Jumlah Penarikan
              </label>
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={`Min. Rp ${MIN_WITHDRAWAL.toLocaleString("id-ID")}`}
                className="text-center"
              />
            </div>
            <Button
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleWithdraw}
              disabled={withdrawLoading}
            >
              {withdrawLoading ? "Memproses..." : "Tarik Dana Sekarang"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
