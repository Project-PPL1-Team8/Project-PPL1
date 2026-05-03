import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { formatDateTime, statusClass, shortId } from "./adminUtils";
import { toast } from "sonner";

type DonationItem = {
  id: string;
  donor_id: string;
  donor_name?: string | null;
  recipient_id?: string | null;
  recipient_name?: string | null;
  amount: string | number;
  type: string;
  payment_method: string;
  status: string;
  midtrans_transaction_id?: string | null;
  created_at: string;
  allocation_status: string;
  voucher_created: boolean;
  allocated_beneficiaries: number;
  allocated_total: string | number;
};

type DonationListResponse = {
  items: DonationItem[];
  total: number;
};

export default function AdminDonationsPage() {
  const [items, setItems] = useState<DonationItem[]>([]);
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

  const loadDonations = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiFetch(`/admin/donations?${queryString}`)) as DonationListResponse;
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memuat donasi admin");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadDonations();
  }, [loadDonations]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  return (
    <DashboardLayout title="Kelola Donasi" subtitle="Lihat transaksi donasi dan status alokasinya.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Daftar donasi yang tersedia lewat endpoint admin/donations.</p>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex min-w-[280px] flex-1 items-center gap-2" onSubmit={handleSearchSubmit}>
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari donor, penerima, atau ID transaksi..."
              />
              <Button type="submit" variant="outline" disabled={loading}>
                Search
              </Button>
            </form>
            <Button variant="outline" onClick={() => void loadDonations()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Memuat data donasi...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Belum ada data donasi.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Donasi</th>
                  <th className="px-4 py-3 text-left font-medium">Nominal</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Alokasi</th>
                  <th className="px-4 py-3 text-left font-medium">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{item.donor_name || "Donor"}</div>
                      <div className="text-xs text-muted-foreground">
                        {shortId(item.id)} · {item.type} · {item.payment_method || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-foreground">{formatIDR(Number(item.amount || 0))}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{item.allocation_status}</div>
                      <div>{item.voucher_created ? `${item.allocated_beneficiaries} beneficiary` : "Belum dialokasikan"}</div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{formatDateTime(item.created_at)}</td>
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