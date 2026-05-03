import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { formatDateTime, statusClass, shortId } from "./adminUtils";
import { toast } from "sonner";

type EligibilityItem = {
  user_id: string;
  full_name: string;
  approval_status: "pending" | "approved" | "rejected";
  family_size: number;
  vouchers_balance: string | number;
  latest_fies_score?: number | null;
  latest_fies_classification?: string | null;
  latest_survey_date?: string | null;
  has_current_month_survey: boolean;
  eligible_for_allocation: boolean;
  allocation_month: string;
};

type EligibilityResponse = {
  items: EligibilityItem[];
  total: number;
};

export default function AdminBeneficiariesPage() {
  const [items, setItems] = useState<EligibilityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", "50");
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    return params.toString();
  }, [searchQuery]);

  const loadEligibility = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiFetch(`/admin/beneficiaries/eligibility?${queryString}`)) as EligibilityResponse;
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memuat eligibility penerima");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  return (
    <DashboardLayout title="Kelayakan Penerima" subtitle="Cek penerima yang layak untuk alokasi voucher bulanan.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Data ini berasal dari endpoint admin beneficiaries/eligibility.</p>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex min-w-[280px] flex-1 items-center gap-2" onSubmit={handleSearchSubmit}>
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari nama penerima..."
              />
              <Button type="submit" variant="outline" disabled={loading}>
                Search
              </Button>
            </form>
            <Button variant="outline" onClick={() => void loadEligibility()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Memuat data eligibility...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Belum ada data penerima.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Nama</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Survey</th>
                  <th className="px-4 py-3 text-left font-medium">Eligibility</th>
                  <th className="px-4 py-3 text-left font-medium">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.user_id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{item.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {shortId(item.user_id)} · {formatDateTime(item.latest_survey_date)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.approval_status)}`}>
                        {item.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{item.has_current_month_survey ? "Ada survey bulan ini" : "Belum ada survey bulan ini"}</div>
                      <div>
                        {item.latest_fies_score ?? "-"} / {item.latest_fies_classification || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          item.eligible_for_allocation
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-rose-100 text-rose-700 border-rose-200"
                        }`}
                      >
                        {item.eligible_for_allocation ? "Eligible" : "Not eligible"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>Family: {item.family_size}</div>
                      <div>Voucher balance: {formatIDR(Number(item.vouchers_balance || 0))}</div>
                      <div>Allocation month: {formatDateTime(item.allocation_month)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}