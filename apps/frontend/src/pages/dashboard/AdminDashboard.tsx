import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Users,
  Wallet,
  ShoppingCart,
  QrCode,
  Heart,
  Download,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Store,
  Shield,
  Package,
  ClipboardList,
  ChevronRight,
  Activity,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { toast } from "sonner";

interface AdminStats {
  users: { total: number; donors: number; beneficiaries: number; vendors: number; pending_beneficiaries: number; pending_vendors: number };
  products: { total: number; pending: number; approved: number; rejected: number };
  vouchers: { active_count: number; total_balance: number };
  orders: { total: number; completed: number };
  redemptions: { total_count: number; total_amount: number };
  donations: { total_amount: number };
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch("/admin/stats");
      setStats(data);
    } catch (err: any) {
      setError(err.message);
      toast.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleExport = async (type: string) => {
    try {
      const token = await import("@/integrations/supabase/client").then((m) => m.supabase.auth.getSession());
      const response = await fetch(`${API_BASE}/admin/export/${type}`, {
        headers: { Authorization: `Bearer ${token.data.session?.access_token}` },
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${type}.csv`; a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Berhasil export ${type}.csv`);
    } catch (err: any) {
      toast.error(err.message || "Gagal export");
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Dashboard Admin" subtitle="Kelola sistem dan data SeribuAsa.">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse">
              <div className="h-9 w-9 rounded-xl bg-secondary mb-3" />
              <div className="h-7 w-24 bg-secondary rounded mb-2" />
              <div className="h-3 w-16 bg-secondary rounded" />
            </div>
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Dashboard Admin" subtitle="Kelola sistem dan data SeribuAsa.">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-800 mb-1">Gagal memuat data</h3>
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStats} className="border-red-300 text-red-700">
              <RefreshCw className="mr-2 h-3 w-3" /> Coba Lagi
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const completionRate = stats?.orders.total
    ? Math.round(((stats.orders.completed || 0) / stats.orders.total) * 100)
    : 0;

  return (
    <DashboardLayout title="Dashboard Admin 🛡️" subtitle="Pantau dan kelola seluruh ekosistem SeribuAsa.">
      <div className="space-y-6">
        {/* Hero Summary Bar */}
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)" }}>
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/5" />
          <div className="absolute right-24 bottom-0 h-16 w-16 rounded-full bg-white/5" />
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Donasi", value: formatIDR(stats?.donations.total_amount || 0), icon: Heart, color: "text-rose-400" },
              { label: "Saldo Voucher", value: formatIDR(stats?.vouchers.total_balance || 0), icon: Wallet, color: "text-green-400" },
              { label: "Total Redemption", value: formatIDR(stats?.redemptions.total_amount || 0), icon: QrCode, color: "text-blue-400" },
              { label: "Pesanan Selesai", value: `${completionRate}%`, icon: Activity, color: "text-purple-400" },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 mx-auto mb-2">
                    <Icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className={`text-lg font-extrabold ${item.color}`}>{item.value}</div>
                  <p className="text-[10px] text-white/50 font-medium">{item.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Export Actions */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Export Data</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Users", type: "users", color: "border-blue-200 text-blue-700 hover:bg-blue-50" },
              { label: "Orders", type: "orders", color: "border-green-200 text-green-700 hover:bg-green-50" },
              { label: "Vouchers", type: "vouchers", color: "border-purple-200 text-purple-700 hover:bg-purple-50" },
              { label: "Redemptions", type: "redemptions", color: "border-orange-200 text-orange-700 hover:bg-orange-50" },
            ].map((exp) => (
              <Button
                key={exp.type}
                variant="outline"
                size="sm"
                onClick={() => handleExport(exp.type)}
                className={`gap-2 ${exp.color}`}
              >
                <Download className="h-3.5 w-3.5" /> {exp.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* User Stats */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Pengguna Platform</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Users, label: "Total Pengguna", value: stats?.users.total || 0, sub: "Semua role", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
                  { icon: Heart, label: "Donatur", value: stats?.users.donors || 0, sub: "Mendukung program", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
                  { icon: Users, label: "Penerima Manfaat", value: stats?.users.beneficiaries || 0, sub: "Mendapat voucher", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
                  { icon: Store, label: "Vendor", value: stats?.users.vendors || 0, sub: "Mitra pangan", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
                ].map((card) => {
                  const Icon = card.icon
                  return (
                    <div key={card.label} className={`rounded-2xl border p-4 ${card.border} ${card.bg}`}>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white ${card.border} mb-3`}>
                        <Icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                      <div className={`text-2xl font-extrabold ${card.color}`}>{card.value}</div>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{card.label}</p>
                      <p className="text-[10px] text-muted-foreground">{card.sub}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Statistik Keuangan</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Wallet, label: "Total Saldo Voucher", value: formatIDR(stats?.vouchers.total_balance || 0), sub: `${stats?.vouchers.active_count || 0} voucher aktif`, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
                  { icon: QrCode, label: "Total Redemption", value: formatIDR(stats?.redemptions.total_amount || 0), sub: `${stats?.redemptions.total_count || 0} transaksi`, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
                  { icon: ShoppingCart, label: "Pesanan Selesai", value: stats?.orders.completed || 0, sub: `dari ${stats?.orders.total || 0} pesanan`, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
                  { icon: TrendingUp, label: "Total Donasi", value: formatIDR(stats?.donations.total_amount || 0), sub: "Dana terkumpul", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
                ].map((card) => {
                  const Icon = card.icon
                  return (
                    <div key={card.label} className={`rounded-2xl border p-4 ${card.border} ${card.bg}`}>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white ${card.border} mb-3`}>
                        <Icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                      <div className={`text-base font-extrabold leading-tight ${card.color} truncate`}>{card.value}</div>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{card.label}</p>
                      <p className="text-[10px] text-muted-foreground">{card.sub}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Quick Admin Links */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-slate-600" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Menu Admin</p>
            </div>
            <div className="space-y-2">
              {[
                { label: "Kelola Pengguna", desc: `${stats?.users.total || 0} total akun`, icon: Users, href: "/dashboard/admin/users", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
                { label: "Kelola Produk", desc: `${stats?.products.total || 0} produk`, icon: Package, href: "/dashboard/admin/products", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
                { label: "Kelayakan Penerima", desc: `${stats?.users.pending_beneficiaries || 0} pending review`, icon: ClipboardList, href: "/dashboard/admin/beneficiaries", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
                { label: "Kelola Voucher", desc: `${stats?.vouchers.active_count || 0} voucher aktif`, icon: Wallet, href: "/dashboard/admin/vouchers", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
                { label: "Kelola Donasi", desc: formatIDR(stats?.donations.total_amount || 0), icon: Heart, href: "/dashboard/admin/donations", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
                { label: "Kelola Pesanan", desc: `${stats?.orders.total || 0} total pesanan`, icon: ShoppingCart, href: "/dashboard/admin/orders", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
                { label: "Laporan & Analitik", desc: "Ekspor data & insight", icon: TrendingUp, href: "/dashboard/admin/reports", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
              ].map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.label}
                    to={link.href}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm group ${link.border} bg-card`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${link.bg} border ${link.border}`}>
                      <Icon className={`h-4 w-4 ${link.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{link.label}</div>
                      <div className="text-xs text-muted-foreground">{link.desc}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
