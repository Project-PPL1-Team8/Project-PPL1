import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { getDemographicsReport, getRegionalReport, type DemographicsReport, type RegionalReport } from "@/services/reports";
import { downloadTextFile } from "./adminUtils";
import { toast } from "sonner";
import { RefreshCw, Download, Users, Package, Wallet, ShoppingCart, TrendingUp, AlertCircle } from "lucide-react";

const reports = [
  { label: "Users", endpoint: "/admin/export/users", filename: "users.csv" },
  { label: "Orders", endpoint: "/admin/export/orders", filename: "orders.csv" },
  { label: "Vouchers", endpoint: "/admin/export/vouchers", filename: "vouchers.csv" },
  { label: "Redemptions", endpoint: "/admin/export/redemptions", filename: "redemptions.csv" },
] as const;

type AdminStatsResponse = {
  users: {
    total: number;
    donors: number;
    beneficiaries: number;
    vendors: number;
    pending_beneficiaries: number;
    pending_vendors: number;
  };
  products: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  vouchers: {
    active_count: number;
    total_balance: number;
  };
  orders: {
    total: number;
    completed: number;
    pending: number;
  };
  redemptions: {
    total_count: number;
    total_amount: number;
  };
  donations: {
    total_amount: number;
    success_count: number;
    pending_count: number;
    failed_count: number;
    refunded_count: number;
    unallocated_success_count: number;
  };
};

export default function AdminReportsPage() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [regionalReport, setRegionalReport] = useState<RegionalReport | null>(null);
  const [demographicsReport, setDemographicsReport] = useState<DemographicsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsResult, regionalResult, demographicsResult] = await Promise.allSettled([
        apiFetch("/admin/stats") as Promise<AdminStatsResponse>,
        getRegionalReport(),
        getDemographicsReport(),
      ]);

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value);
      } else {
        setError(statsResult.reason?.message || "Gagal memuat ringkasan admin");
      }

      if (regionalResult.status === "fulfilled") {
        setRegionalReport(regionalResult.value);
      } else {
        toast.error(regionalResult.reason?.message || "Gagal memuat regional report");
      }

      if (demographicsResult.status === "fulfilled") {
        setDemographicsReport(demographicsResult.value);
      } else {
        toast.error(demographicsResult.reason?.message || "Gagal memuat demographics report");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memuat laporan admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

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

  const summaryCards = useMemo(() => {
    if (!stats) return [];

    return [
      {
        label: "Total Pengguna",
        value: stats.users.total,
        icon: Users,
        tone: "text-slate-700",
        bg: "bg-slate-50",
        border: "border-slate-200",
        description: `${stats.users.donors} donor · ${stats.users.beneficiaries} penerima · ${stats.users.vendors} vendor`,
      },
      {
        label: "Produk Aktif",
        value: stats.products.total,
        icon: Package,
        tone: "text-indigo-700",
        bg: "bg-indigo-50",
        border: "border-indigo-200",
        description: `${stats.products.pending} pending · ${stats.products.approved} approved`,
      },
      {
        label: "Saldo Voucher",
        value: formatIDR(stats.vouchers.total_balance),
        icon: Wallet,
        tone: "text-green-700",
        bg: "bg-green-50",
        border: "border-green-200",
        description: `${stats.vouchers.active_count} voucher aktif`,
      },
      {
        label: "Pesanan Selesai",
        value: stats.orders.completed,
        icon: ShoppingCart,
        tone: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-200",
        description: `${stats.orders.total} total pesanan · ${stats.orders.pending} pending`,
      },
      {
        label: "Total Donasi",
        value: formatIDR(stats.donations.total_amount),
        icon: TrendingUp,
        tone: "text-rose-700",
        bg: "bg-rose-50",
        border: "border-rose-200",
        description: `${stats.donations.success_count} success · ${stats.donations.failed_count} failed`,
      },
      {
        label: "Redemption",
        value: formatIDR(stats.redemptions.total_amount),
        icon: Download,
        tone: "text-orange-700",
        bg: "bg-orange-50",
        border: "border-orange-200",
        description: `${stats.redemptions.total_count} transaksi`,
      },
    ];
  }, [stats]);

  const formatReportDate = (value?: string | Date | null) => {
    if (!value) return "-";

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed);
  };

  const renderDistributionList = (title: string, items: Array<{ label: string; count: number; percentage: number }>) => (
    <div className="rounded-2xl border border-border bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-foreground mb-3">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada data.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl bg-white px-3 py-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.count} item</div>
              </div>
              <div className="text-sm font-semibold text-foreground">{item.percentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout title="Laporan & Analitik" subtitle="Ringkasan admin, regional report, dan demografi dari backend yang sudah terhubung.">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {loading ? "Memuat laporan admin..." : "Data di bawah diambil langsung dari backend."}
          </p>
          <Button variant="outline" onClick={() => void loadReports()} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !stats && !regionalReport && !demographicsReport ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-border bg-card p-5 animate-pulse">
                  <div className="h-4 w-24 rounded bg-slate-200 mb-4" />
                  <div className="h-8 w-32 rounded bg-slate-200 mb-2" />
                  <div className="h-3 w-full rounded bg-slate-200" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 h-72 animate-pulse" />
              <div className="rounded-2xl border border-border bg-card p-5 h-72 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`rounded-2xl border p-5 ${card.border} ${card.bg}`}>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white ${card.border} mb-3`}>
                      <Icon className={`h-4 w-4 ${card.tone}`} />
                    </div>
                    <div className={`text-2xl font-extrabold ${card.tone}`}>{card.value}</div>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{card.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{card.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Regional report</h3>
                  <p className="text-sm text-muted-foreground">
                    {regionalReport
                      ? `Periode ${formatReportDate(regionalReport.period?.start_date)} sampai ${formatReportDate(regionalReport.period?.end_date)}`
                      : "Data regional belum tersedia."}
                  </p>
                </div>

                {regionalReport ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Beneficiaries</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.coverage.total_beneficiaries}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Children</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.coverage.total_children}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Vendors</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.coverage.total_vendors}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Districts</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.coverage.districts_covered}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Stunting rate</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.stunting_rate.current.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">
                          Sebelumnya {regionalReport.stunting_rate.previous.toFixed(1)}% · {regionalReport.stunting_rate.trend}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Budget utilization</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.budget_utilization.percentage.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">{formatIDR(regionalReport.budget_utilization.utilized)} dipakai dari {formatIDR(regionalReport.budget_utilization.allocated)}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-sm text-muted-foreground">Region</div>
                        <div className="text-lg font-semibold text-foreground">{regionalReport.region}</div>
                        <div className="text-xs text-muted-foreground">{formatReportDate(regionalReport.period?.end_date)}</div>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-border bg-white">
                      <table className="min-w-full divide-y divide-border text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">District</th>
                            <th className="px-4 py-3 text-left font-medium">Beneficiaries</th>
                            <th className="px-4 py-3 text-left font-medium">Children</th>
                            <th className="px-4 py-3 text-left font-medium">Stunting</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {regionalReport.district_breakdown.map((district) => (
                            <tr key={district.district}>
                              <td className="px-4 py-3 font-medium text-foreground">{district.district}</td>
                              <td className="px-4 py-3 text-muted-foreground">{district.beneficiaries}</td>
                              <td className="px-4 py-3 text-muted-foreground">{district.children}</td>
                              <td className="px-4 py-3 text-muted-foreground">{district.stunting_rate.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-border bg-slate-50 p-4 text-sm text-muted-foreground">
                    Regional report belum berhasil dimuat.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Demographics report</h3>
                  <p className="text-sm text-muted-foreground">Distribusi data dari backend admin reports.</p>
                </div>

                {demographicsReport ? (
                  <div className="grid gap-3">
                    {renderDistributionList("Age distribution", demographicsReport.age_distribution)}
                    {renderDistributionList("Gender distribution", demographicsReport.gender_distribution)}
                    {renderDistributionList("Nutrition status", demographicsReport.nutrition_status)}
                    {renderDistributionList("FIES classification", demographicsReport.fies_classification)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-slate-50 p-4 text-sm text-muted-foreground">
                    Demographics report belum berhasil dimuat.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-lg font-semibold text-foreground mb-2">Export cepat</h3>
              <p className="text-sm text-muted-foreground mb-4">Gunakan endpoint backend admin yang sudah siap untuk download CSV.</p>
              <div className="flex flex-wrap gap-2">
                {reports.map((report) => (
                  <Button key={report.filename} variant="outline" onClick={() => void handleExport(report.endpoint, report.filename)}>
                    <Download className="mr-2 h-4 w-4" />
                    Export {report.label}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}