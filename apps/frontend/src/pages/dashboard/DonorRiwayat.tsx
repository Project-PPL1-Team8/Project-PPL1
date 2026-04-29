import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Download,
  FileText,
  Search,
  Heart,
  TrendingUp,
  CheckCircle,
  Plus,
  Loader2,
} from "lucide-react";
import { formatIDR, formatDate } from "@/lib/format";
import { getDonations } from "@/services/donations";
import {
  downloadDonationReceipt,
  exportDonationHistory,
  triggerDownload,
} from "@/services/downloads";
import type { Donation, DonationStatus } from "@/types/donation";
import { toast } from "sonner";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { CardSkeletonGrid, ListItemSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { KpiCard, KpiCardGrid } from "@/components/dashboard/KpiCard";
import { donationStatusConfig } from "@/lib/status-config";

type FilterKey = "all" | DonationStatus;

const filterTabs: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "success", label: "Sukses" },
  { key: "pending", label: "Menunggu" },
  { key: "failed", label: "Gagal" },
];

const DonorRiwayat = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchDonations = useCallback(async () => {
    const controller = new AbortController();
    try {
      setLoading(true);
      setError(null);
      const data = await getDonations();
      setDonations(data || []);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Gagal memuat riwayat donasi";
      setError(msg);
      toast.error("Gagal memuat riwayat donasi");
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (user) fetchDonations();
  }, [user, fetchDonations]);

  // Handle download receipt
  const handleDownloadReceipt = async (donationId: string) => {
    setDownloadingReceipt(donationId);
    try {
      const blob = await downloadDonationReceipt(donationId);
      triggerDownload(blob, `kwitansi-donasi-${donationId.slice(0, 8)}.pdf`);
      toast.success("Kwitansi berhasil diunduh");
    } catch (err: any) {
      toast.error("Gagal mengunduh kwitansi", { description: err.message });
    } finally {
      setDownloadingReceipt(null);
    }
  };

  // Handle export history
  const handleExportHistory = async () => {
    setExporting(true);
    try {
      const blob = await exportDonationHistory("csv", {
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      const dateStr = new Date().toISOString().split("T")[0];
      triggerDownload(blob, `riwayat-donasi-${dateStr}.csv`);
      toast.success("Riwayat berhasil diekspor");
    } catch (err: any) {
      toast.error("Gagal mengekspor riwayat", { description: err.message });
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(
    () =>
      donations.filter((d) => {
        if (statusFilter !== "all" && d.status !== statusFilter) return false;
        if (search) {
          const typeLabel = d.type === "subscription" ? "Donasi Langganan" : "Donasi Satu Kali";
          return typeLabel.toLowerCase().includes(search.toLowerCase());
        }
        return true;
      }),
    [donations, search, statusFilter]
  );

  const totalDonated = useMemo(
    () =>
      filtered.filter((d) => d.status === "success").reduce((sum, d) => sum + (d.amount || 0), 0),
    [filtered]
  );

  const totalCount = donations.length;
  const successCount = useMemo(
    () => donations.filter((d) => d.status === "success").length,
    [donations]
  );

  if (loading) {
    return (
      <DashboardLayout title="Riwayat Donasi" subtitle="Semua transaksi donasi Anda.">
        <div className="space-y-4">
          <CardSkeletonGrid count={3} columns={3} />
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <ListItemSkeleton count={5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Riwayat Donasi" subtitle="Semua transaksi donasi Anda.">
        <ErrorState message={error} onRetry={fetchDonations} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Riwayat Donasi" subtitle="Semua transaksi donasi Anda.">
      <div className="space-y-5">
        {/* Stats Row */}
        <KpiCardGrid columns={3}>
          <KpiCard
            icon={Heart}
            label="Total Berhasil"
            value={formatIDR(totalDonated)}
            variant="rose"
          />
          <KpiCard
            icon={TrendingUp}
            label="Total Transaksi"
            value={`${totalCount}x`}
            variant="blue"
          />
          <KpiCard icon={CheckCircle} label="Sukses" value={`${successCount}x`} variant="green" />
        </KpiCardGrid>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari donasi..."
              className="pl-9 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? "bg-rose-600 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 flex-shrink-0"
            onClick={handleExportHistory}
            disabled={exporting || donations.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Unduh
          </Button>
        </div>

        {/* Transaction List */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-14">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 mx-auto mb-4">
                <Heart className="h-6 w-6 text-rose-400" />
              </div>
              <p className="font-semibold text-foreground mb-1">Tidak ada donasi ditemukan</p>
              <p className="text-sm text-muted-foreground mb-5">
                {search || statusFilter !== "all"
                  ? "Coba ubah kata kunci"
                  : "Mulai berdonasi untuk mendukung nutrisi anak"}
              </p>
              <Button
                size="sm"
                onClick={() => navigate("/donation/create")}
                className="bg-rose-600 hover:bg-rose-700 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Buat Donasi
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((d) => {
                const typeLabel =
                  d.type === "subscription" ? "Donasi Langganan" : "Donasi Satu Kali";
                const sc = donationStatusConfig[d.status] || {
                  ...donationStatusConfig.pending,
                  label: d.status,
                  icon: FileText,
                };
                const StatusIcon = sc.icon;
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors group"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-50">
                      <Heart className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{typeLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(d.created_at)}
                        {d.payment_method && (
                          <span className="ml-1.5 opacity-60">
                            · {d.payment_method.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3 flex-shrink-0">
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          {formatIDR(d.amount)}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] border gap-0.5 ${sc.className}`}
                        >
                          <StatusIcon className="h-2.5 w-2.5" />
                          {sc.label}
                        </Badge>
                      </div>
                      {d.status === "success" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDownloadReceipt(d.id)}
                          disabled={downloadingReceipt === d.id}
                          aria-label={`Unduh kwitansi untuk donasi ${d.id.slice(0, 8)}`}
                        >
                          {downloadingReceipt === d.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DonorRiwayat;
