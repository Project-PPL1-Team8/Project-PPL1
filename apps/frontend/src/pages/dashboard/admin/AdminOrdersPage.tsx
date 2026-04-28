import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { formatDateTime, statusClass, shortId } from "./adminUtils";
import { toast } from "sonner";

type OrderItem = {
  id: string;
  user_id: string;
  vendor_id: string;
  cart_total: string | number;
  voucher_discount: string | number;
  cash_amount: string | number;
  status: string;
  payment_status: string;
  vendor_store_name?: string | null;
  created_at: string;
};

type OrderListResponse = {
  items: OrderItem[];
  total: number;
};

export default function AdminOrdersPage() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiFetch("/orders?page=1&page_size=50")) as OrderListResponse;
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memuat order");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <DashboardLayout title="Kelola Pesanan" subtitle="Lihat pesanan yang tersedia untuk role admin.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Route ini memakai endpoint order yang sudah mendukung role admin.</p>
          <Button variant="outline" onClick={() => void loadOrders()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Memuat data pesanan...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Belum ada pesanan.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Nilai</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Waktu</th>
                  <th className="px-4 py-3 text-left font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{item.vendor_store_name || "Vendor"}</div>
                      <div className="text-xs text-muted-foreground">
                        {shortId(item.id)} · {shortId(item.vendor_id)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{formatIDR(Number(item.cart_total || 0))}</div>
                      <div className="text-xs">
                        Voucher: {formatIDR(Number(item.voucher_discount || 0))} · Cash: {formatIDR(Number(item.cash_amount || 0))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                      <div className="text-xs text-muted-foreground mt-1">Payment: {item.payment_status || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{formatDateTime(item.created_at)}</td>
                    <td className="px-4 py-4">
                      <Link to={`/dashboard/orders/${item.id}`} className="text-sm font-medium text-primary hover:underline">
                        Buka detail
                      </Link>
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