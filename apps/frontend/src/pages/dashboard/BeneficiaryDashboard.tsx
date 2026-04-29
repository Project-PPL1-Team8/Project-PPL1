import { useEffect, useState, useMemo, useCallback } from "react";
import type { ElementType } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVoucherData } from "@/hooks/useVoucherData";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  ClipboardList,
  Activity,
  ShoppingBasket,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  ShoppingCart,
  Ticket,
  CheckCircle2,
  ChevronRight,
  Package,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  getLatestFIESStatus,
  getLatestNutritionMeasurement,
} from "@/services/nutrition";
import { formatIDR, formatDate } from "@/lib/format";
import { useStaggerChildren } from "@/hooks/useStaggerChildren";
import { toast } from "sonner";
import type { FIESStatus, NutritionData, VoucherTransaction } from "@/types";

interface QuickAction {
  label: string;
  desc: string;
  icon: ElementType;
  href: string;
  iconWrapClass: string;
  iconClass: string;
}

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
  linkLabel: string;
  href: string;
  icon: ElementType;
  iconWrapClass: string;
  iconClass: string;
  valueClass: string;
  accentClass: string;
  showWarning?: boolean;
}

function SummaryCard({
  title,
  value,
  description,
  linkLabel,
  href,
  icon: Icon,
  iconWrapClass,
  iconClass,
  valueClass,
  accentClass,
  showWarning = false,
}: SummaryCardProps) {
  return (
    <Link
      to={href}
      className="group relative overflow-hidden rounded-[18px] border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.075)]"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-60 ${accentClass}`}
      />

      {showWarning && (
        <AlertTriangle className="absolute right-3.5 top-3.5 h-[18px] w-[18px] text-amber-500" />
      )}

      <div className="relative z-10 flex min-h-[82px] items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconWrapClass}`}
        >
          <Icon className={`h-[18px] w-[18px] ${iconClass}`} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-600">{title}</p>

          <p
            className={`mt-0.5 text-lg font-extrabold leading-tight tracking-tight ${valueClass}`}
          >
            {value}
          </p>

          <p className="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-slate-500">
            {description}
          </p>

          <div
            className={`mt-3 flex items-center gap-1.5 text-[11px] font-bold ${valueClass}`}
          >
            <span>{linkLabel}</span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BeneficiaryDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const {
    data: balance,
    transactions,
    loading: voucherLoading,
    error: voucherError,
    refetch: refetchVouchers,
  } = useVoucherData();

  const [fiesStatus, setFiesStatus] = useState<FIESStatus | null>(null);
  const [nutritionData, setNutritionData] = useState<NutritionData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gridRef = useStaggerChildren({ stagger: 0.08 });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  const fetchAdditionalData = useCallback(async () => {
    if (!user?.id) return;

    setDataLoading(true);
    setError(null);

    try {
      const [fiesData, nutritionMeasure] = await Promise.all([
        getLatestFIESStatus(user.id).catch(() => null),
        getLatestNutritionMeasurement(user.id).catch(() => null),
      ]);

      setFiesStatus(fiesData);
      setNutritionData(nutritionMeasure);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Gagal memuat data";

      setError(errorMessage);

      toast.error("Gagal memuat data dashboard", {
        description: errorMessage,
      });
    } finally {
      setDataLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchAdditionalData();
    }
  }, [user, fetchAdditionalData]);

  const totalBalance = balance?.total_balance ?? 0;
  const activeVouchers = balance?.active_vouchers?.length ?? 0;

  const hasFiesThisMonth = useMemo(() => {
    if (!fiesStatus?.survey_date) return false;

    const surveyDate = new Date(fiesStatus.survey_date);
    const now = new Date();

    return (
      surveyDate.getFullYear() === now.getFullYear() &&
      surveyDate.getMonth() === now.getMonth()
    );
  }, [fiesStatus]);

  const isLoading = authLoading || voucherLoading || dataLoading;

  if (isLoading) {
    return (
      <DashboardLayout title="Beranda" subtitle="Penerima Manfaat">
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Memuat dashboard...
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || voucherError) {
    return (
      <DashboardLayout title="Beranda" subtitle="Penerima Manfaat">
        <div className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>

          <div className="flex-1">
            <h3 className="mb-1 font-semibold text-red-800">
              Gagal memuat data
            </h3>

            <p className="mb-3 text-sm text-red-600">
              {error || voucherError}
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchVouchers();
                fetchAdditionalData();
              }}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Coba Lagi
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const quickActions: QuickAction[] = [
    {
      label: "Katalog Pangan",
      desc: "Beli bahan makanan bergizi",
      icon: ShoppingBasket,
      href: "/dashboard/katalog",
      iconWrapClass: "bg-green-100",
      iconClass: "text-green-600",
    },
    {
      label: "Keranjang Belanja",
      desc: "Lihat & kelola item belanja",
      icon: ShoppingCart,
      href: "/dashboard/cart",
      iconWrapClass: "bg-blue-100",
      iconClass: "text-blue-600",
    },
    {
      label: "Riwayat Pesanan",
      desc: "Lihat pesanan sebelumnya",
      icon: Package,
      href: "/dashboard/orders",
      iconWrapClass: "bg-orange-100",
      iconClass: "text-orange-600",
    },
    {
      label: "Pemantauan Gizi",
      desc: "Pantau tumbuh kembang anak",
      icon: Activity,
      href: "/dashboard/pemantauan-gizi",
      iconWrapClass: "bg-teal-100",
      iconClass: "text-teal-600",
    },
  ];

  const shoppingSteps = [
    {
      number: 1,
      label: "Pilih Produk",
      desc: "Pilih produk bergizi",
      icon: ShoppingBasket,
      iconWrapClass: "bg-green-100",
      iconClass: "text-green-600",
    },
    {
      number: 2,
      label: "Keranjang",
      desc: "Atur item belanja",
      icon: ShoppingCart,
      iconWrapClass: "bg-blue-100",
      iconClass: "text-blue-600",
    },
    {
      number: 3,
      label: "Checkout",
      desc: "Bayar dengan voucher",
      icon: Ticket,
      iconWrapClass: "bg-purple-100",
      iconClass: "text-purple-600",
    },
    {
      number: 4,
      label: "Selesai",
      desc: "Pesanan terkonfirmasi",
      icon: CheckCircle2,
      iconWrapClass: "bg-orange-100",
      iconClass: "text-orange-600",
    },
  ];

  const userDisplayName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "Penerima";

  const fiesValue = fiesStatus?.classification || "Belum Ada";
  const nutritionValue = nutritionData?.classification || "Normal";

  const nutritionZScore =
    typeof nutritionData?.z_score_weight_height === "number"
      ? nutritionData.z_score_weight_height.toFixed(1)
      : "-";

  return (
    <DashboardLayout
      title={`Selamat datang, ${userDisplayName}`}
      subtitle="Kelola voucher nutrisi dan pantau kesehatan keluarga Anda."
    >
      <div className="space-y-3.5">
        {/* Summary Cards */}
        <div ref={gridRef} className="grid gap-3 lg:grid-cols-3">
          <SummaryCard
            title="Saldo E-Voucher"
            value={formatIDR(totalBalance)}
            description={`${activeVouchers} voucher aktif`}
            linkLabel="Lihat dompet"
            href="/dashboard/dompet-nutrisi"
            icon={Wallet}
            iconWrapClass="bg-green-100"
            iconClass="text-green-600"
            valueClass="text-green-600"
            accentClass="bg-[radial-gradient(circle_at_80%_110%,rgba(34,197,94,0.16),transparent_45%)]"
          />

          <SummaryCard
            title="Status Survei FIES"
            value={fiesValue}
            description={
              fiesStatus?.survey_date
                ? formatDate(fiesStatus.survey_date)
                : "Isi survei bulanan"
            }
            linkLabel="Lihat survei"
            href="/dashboard/survei-fies"
            icon={ClipboardList}
            iconWrapClass="bg-blue-100"
            iconClass="text-blue-600"
            valueClass="text-blue-600"
            accentClass="bg-[radial-gradient(circle_at_80%_110%,rgba(59,130,246,0.12),transparent_45%)]"
            showWarning={!hasFiesThisMonth}
          />

          <SummaryCard
            title="Status Gizi Anak"
            value={nutritionValue}
            description={`Status Gizi\nz-score: ${nutritionZScore}`}
            linkLabel="Lihat detail"
            href="/dashboard/pemantauan-gizi"
            icon={TrendingUp}
            iconWrapClass="bg-teal-100"
            iconClass="text-teal-600"
            valueClass="text-teal-600"
            accentClass="bg-[radial-gradient(circle_at_80%_110%,rgba(20,184,166,0.14),transparent_45%)]"
          />
        </div>

        {/* FIES Warning Banner */}
        {!hasFiesThisMonth && (
          <div className="flex flex-col gap-2.5 rounded-[16px] border border-orange-200 bg-orange-50/70 px-4 py-3 shadow-[0_6px_18px_rgba(251,146,60,0.06)] sm:flex-row sm:items-center">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
              <AlertTriangle className="h-[18px] w-[18px] text-orange-600" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-orange-700">
                Survei FIES Bulan Ini Belum Diisi
              </p>

              <p className="mt-0.5 text-xs leading-snug text-slate-600">
                Isi survei agar kelayakan voucher Anda tetap terjaga.
              </p>
            </div>

            <Button
              className="h-9 rounded-xl bg-orange-500 px-5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 sm:min-w-[116px]"
              asChild
            >
              <Link to="/dashboard/survei-fies">Isi Sekarang</Link>
            </Button>
          </div>
        )}

        {/* Quick Actions */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
            Aksi Cepat
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.label}
                  to={action.href}
                  className="group flex items-center gap-3 rounded-[16px] border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${action.iconWrapClass}`}
                  >
                    <Icon className={`h-[18px] w-[18px] ${action.iconClass}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {action.label}
                    </p>

                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {action.desc}
                    </p>
                  </div>

                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-600">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Bottom Content */}
        <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
          {/* Shopping Flow */}
          <section className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
            <h2 className="mb-3 text-sm font-bold tracking-tight text-slate-900 sm:text-base">
              Alur Belanja
            </h2>

            <div className="overflow-x-auto">
              <div className="grid min-w-[500px] grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-2">
                {shoppingSteps.map((step, index) => {
                  const Icon = step.icon;

                  return (
                    <div key={step.number} className="contents">
                      <div className="flex min-w-0 flex-col items-center text-center">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${step.iconWrapClass}`}
                        >
                          <Icon
                            className={`h-[18px] w-[18px] ${step.iconClass}`}
                          />
                        </div>

                        <p className="mt-2.5 text-xs font-bold leading-tight text-slate-950">
                          {step.number}. {step.label}
                        </p>

                        <p className="mt-1 text-[11px] leading-snug text-slate-500">
                          {step.desc}
                        </p>
                      </div>

                      {index < shoppingSteps.length - 1 && (
                        <div className="mt-5 h-px w-10 bg-slate-300 sm:w-12" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Recent Transactions */}
          <section className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                Transaksi Terakhir
              </h2>

              {transactions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-lg px-2 text-xs"
                  asChild
                >
                  <Link to="/dashboard/dompet-nutrisi">
                    Semua
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>

            {transactions.length === 0 ? (
              <div className="flex min-h-[122px] flex-col items-center justify-center rounded-2xl bg-white px-4 py-5 text-center">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Wallet className="h-5 w-5 text-slate-500" />
                </div>

                <p className="text-sm font-bold text-slate-900">
                  Belum ada transaksi
                </p>

                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Mulai belanja untuk melihat riwayat transaksi Anda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.slice(0, 4).map((t: VoucherTransaction) => {
                  const isCredit = (t.amount || 0) > 0;

                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-slate-50/80"
                    >
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                          isCredit ? "bg-green-100" : "bg-slate-100"
                        }`}
                      >
                        <Wallet
                          className={`h-[18px] w-[18px] ${
                            isCredit ? "text-green-600" : "text-slate-500"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {t.description || t.source || "Transaksi"}
                        </div>

                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {t.date ? formatDate(t.date) : "-"}
                        </div>
                      </div>

                      <div
                        className={`flex-shrink-0 text-xs font-bold ${
                          isCredit ? "text-green-600" : "text-slate-900"
                        }`}
                      >
                        {isCredit ? "+" : "-"}
                        {formatIDR(Math.abs(t.amount || 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}