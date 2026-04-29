import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Heart,
  CreditCard,
  Users,
  BarChart3,
  ArrowRight,
  TrendingUp,
  Plus,
} from "lucide-react";
import { formatIDR, formatDate } from "@/lib/format";
import { useStaggerChildren } from "@/hooks/useStaggerChildren";
import { useDonations } from "@/hooks/useDonations";
import { useImpactReport } from "@/hooks/useImpactReport";
import { useSmartPolling } from "@/hooks/useSmartPolling";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { donationStatusConfig } from "@/lib/status-config";
import type { Donation } from "@/types/donation";
import foto from "@/assets/header-donor.svg";

export default function DonorDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const gridRef = useStaggerChildren({ stagger: 0.1 });

  const {
    data: { donations, metrics },
    loading: donationsLoading,
    error: donationsError,
    refetch: refetchDonations,
    refetchMetrics,
  } = useDonations();

  const [{ startDate, endDate }] = useState(() => {
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    return { startDate: start, endDate: end };
  });

  const { data: report, refetch: refetchReport } = useImpactReport(
    startDate,
    endDate
  );

  useSmartPolling(
    async () => {
      await Promise.all([refetchDonations(), refetchMetrics()]);
    },
    { interval: 30000, enabled: !!user, onVisible: true }
  );

  const totalDonated = useMemo(() => {
    if (report?.summary?.total_donated) return report.summary.total_donated;

    return donations
      .filter((d) => d.status === "success")
      .reduce((sum, d) => sum + (d.amount || 0), 0);
  }, [report, donations]);

  const childrenHelped = useMemo(() => {
    if (report?.summary?.total_children_helped) {
      return report.summary.total_children_helped;
    }

    return donations.filter((d) => d.recipient_id).length;
  }, [report, donations]);

  const redemptionRate = useMemo(() => {
    if (donations.length > 0) {
      return Math.round(
        (donations.filter((d) => d.status === "success").length /
          donations.length) *
          100
      );
    }

    return 0;
  }, [donations]);

  const isLoading = authLoading || donationsLoading;

  if (isLoading) {
    return (
      <DashboardLayout
        title="Dashboard Donatur"
        subtitle="Memuat data donasi Anda..."
      >
        <PageSkeleton />
      </DashboardLayout>
    );
  }

  if (donationsError) {
    return (
      <DashboardLayout
        title="Dashboard Donatur"
        subtitle="Ringkasan donasi dan dampak Anda."
      >
        <ErrorState
          message={donationsError}
          onRetry={() => {
            refetchDonations();
            refetchReport();
          }}
        />
      </DashboardLayout>
    );
  }

  const summaryCards = [
    {
      label: "Total Donasi",
      value: formatIDR(totalDonated),
      subtitle: "Akumulasi donasi berhasil",
      helper: "Bulan ini",
      icon: Heart,
      iconWrapClass: "bg-rose-50 text-rose-500",
      valueClass: "text-rose-600",
      borderClass: "border-rose-100",
    },
    {
      label: "Paket Aktif",
      value: `${metrics?.active_subscriptions || 0} Paket`,
      subtitle: metrics?.active_subscriptions
        ? "Langganan sedang berjalan"
        : "Belum ada langganan aktif",
      helper: "Langganan",
      icon: CreditCard,
      iconWrapClass: "bg-blue-50 text-blue-500",
      valueClass: "text-blue-600",
      borderClass: "border-blue-100",
    },
    {
      label: "Penerima Didukung",
      value: `${childrenHelped} Anak`,
      subtitle: "Penerima manfaat dari donasi Anda",
      helper: "Penerima",
      icon: Users,
      iconWrapClass: "bg-emerald-50 text-emerald-500",
      valueClass: "text-emerald-600",
      borderClass: "border-emerald-100",
    },
    {
      label: "Voucher Digunakan",
      value: `${redemptionRate}%`,
      subtitle: "Persentase voucher yang telah dimanfaatkan",
      helper: "Penggunaan",
      icon: BarChart3,
      iconWrapClass: "bg-violet-50 text-violet-500",
      valueClass: "text-violet-600",
      borderClass: "border-violet-100",
    },
  ] as const;

  const impactItems = [
    {
      label: "Voucher ditukarkan",
      value: `${
        (metrics as unknown as {
          monthly_stats?: { vouchers_redeemed?: number };
        })?.monthly_stats?.vouchers_redeemed ?? 0
      } voucher`,
      icon: CreditCard,
    },
    {
      label: "Anak mendapat nutrisi",
      value: `${
        (metrics as unknown as {
          monthly_stats?: { children_received_nutrition?: number };
        })?.monthly_stats?.children_received_nutrition ?? 0
      } anak`,
      icon: Users,
    },
    {
      label: "Peningkatan skor pangan",
      value: `+${
        (metrics as unknown as {
          monthly_stats?: { nutrition_score_improvement?: number };
        })?.monthly_stats?.nutrition_score_improvement ?? 0
      }%`,
      icon: TrendingUp,
    },
    {
      label: "Kategori terbanyak",
      value:
        (metrics as unknown as {
          monthly_stats?: { top_category?: string };
        })?.monthly_stats?.top_category ?? "Pangan Umum",
      icon: BarChart3,
    },
  ] as const;

  return (
    <DashboardLayout
      title="Dashboard Donatur"
      subtitle="Ringkasan donasi dan dampak Anda bulan ini."
    >
      <div className="space-y-3">
        {/* Header Actions */}
        <div className="-mt-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            variant="outline"
            className="h-9 rounded-xl border-slate-200 bg-white px-4 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => navigate("/donasi")}
          >
            <Heart className="mr-2 h-3.5 w-3.5" />
            Lihat Paket
          </Button>

          <Button
            className="h-9 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
            onClick={() => navigate("/donation/checkout")}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Donasi Baru
          </Button>
        </div>

        {/* Thank You Banner */}
        <div className="relative overflow-hidden rounded-[14px] border border-emerald-200 bg-gradient-to-r from-emerald-50 via-emerald-50 to-white px-4 py-2 shadow-sm">
          <div className="flex min-h-[58px] items-center gap-4">
            <div className="flex h-[58px] w-[92px] shrink-0 items-end justify-center overflow-hidden">
              <img
                src={foto}
                alt="Ilustrasi anak menerima nutrisi"
                className="h-[58px] w-[92px] object-contain object-bottom"
              />
            </div>

            <p className="max-w-2xl text-xs font-semibold leading-5 text-emerald-900 sm:text-[13px]">
              Terima kasih!
              <span className="ml-1.5">
                Dukungan Anda membantu lebih banyak anak menerima nutrisi bulan ini.
              </span>
            </p>

            <Heart className="pointer-events-none absolute right-8 top-1/2 h-9 w-9 -translate-y-1/2 text-white/80" />
          </div>
        </div>

        {/* KPI Cards */}
        <div
          ref={gridRef}
          className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
        >
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <Card
                key={card.label}
                className={`rounded-[18px] border bg-white shadow-sm ${card.borderClass}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.iconWrapClass}`}
                    >
                      <Icon className="h-3 w-3" />
                    </div>

                    <div className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {card.helper}
                    </div>
                  </div>

                  <div className="mt-3 space-y-0.5">
                    <p className="text-xs font-medium text-slate-500">
                      {card.label}
                    </p>

                    <p
                      className={`text-xl font-bold leading-none tracking-tight ${card.valueClass}`}
                    >
                      {card.value}
                    </p>

                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {card.subtitle}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Recent Transactions */}
          <Card className="rounded-[18px] border bg-white shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2.5">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Riwayat Donasi Terbaru
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-slate-500">
                  Transaksi donasi terakhir Anda
                </CardDescription>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-xl px-2.5 text-xs font-medium text-slate-700"
                onClick={() => navigate("/dashboard/riwayat")}
              >
                Semua
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent className="pt-0">
              {donations.length === 0 ? (
                <div className="flex min-h-[170px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                    <Heart className="h-3.5 w-3.5 text-emerald-600" />
                  </div>

                  <h3 className="mt-2.5 text-sm font-semibold text-slate-900">
                    Belum ada donasi
                  </h3>

                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Mulai donasi pertama Anda untuk membantu lebih banyak
                    penerima manfaat.
                  </p>

                  <Button
                    variant="link"
                    onClick={() => navigate("/donation/create")}
                    className="mt-2 h-auto p-0 text-xs font-semibold text-emerald-600"
                  >
                    Buat donasi pertama Anda
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {donations.slice(0, 4).map((t: Donation) => {
                    const sc =
                      donationStatusConfig[t.status] ||
                      donationStatusConfig.pending;
                    const StatusIcon = sc.icon;

                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50">
                          <Heart className="h-3 w-3 text-rose-500" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-slate-900 sm:text-sm">
                            {t.type === "subscription"
                              ? "Donasi Langganan"
                              : "Donasi Satu Kali"}
                          </div>

                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {formatDate(t.created_at)}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs font-semibold text-slate-900 sm:text-sm">
                            {formatIDR(t.amount)}
                          </div>

                          <Badge
                            variant="outline"
                            className={`mt-1 gap-1 border text-[10px] ${sc.className}`}
                          >
                            <StatusIcon className="h-2.5 w-2.5" />
                            {sc.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

           {/* Impact Summary */}
          <Card className="rounded-[18px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                </div>

                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Dampak Bulan Ini
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-500">
                    Statistik dampak donasi Anda
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="space-y-2">
                {impactItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-[0_1px_4px_rgba(15,23,42,0.03)]"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                        <Icon className="h-3.5 w-3.5 text-emerald-600" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-600 sm:text-sm">
                          {item.label}
                        </p>
                      </div>

                      <div className="shrink-0 text-right text-xs font-bold text-slate-900 sm:text-sm">
                        {item.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}