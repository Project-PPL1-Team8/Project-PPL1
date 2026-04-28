import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/format";
import { apiFetch } from "@/services/api";
import { formatDateTime, shortId, statusClass } from "./adminUtils";
import { toast } from "sonner";

type ProductReviewItem = {
  id: string;
  vendor_id: string;
  vendor_store_name?: string | null;
  category_name?: string | null;
  name: string;
  description?: string | null;
  price: string | number;
  voucher_price: string | number;
  stock_quantity: number;
  unit: string;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

type ProductReviewListResponse = {
  items: ProductReviewItem[];
  total: number;
};

export default function AdminProductsPage() {
  const [items, setItems] = useState<ProductReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = (await apiFetch("/admin/products/reviews?page=1&page_size=50")) as ProductReviewListResponse;
      setItems(data.items || []);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memuat review produk");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const updateApproval = async (productId: string, approvalStatus: "approved" | "rejected") => {
    try {
      setMutatingId(productId);
      await apiFetch(`/admin/products/${productId}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approval_status: approvalStatus }),
      });
      toast.success(`Produk berhasil di-${approvalStatus === "approved" ? "approve" : "reject"}`);
      await loadProducts();
    } catch (err: any) {
      toast.error(err?.message || "Gagal memperbarui produk");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <DashboardLayout title="Kelola Produk" subtitle="Review dan approval katalog produk vendor.">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Produk yang belum approved atau perlu ditinjau ulang.</p>
          <Button variant="outline" onClick={() => void loadProducts()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Memuat data produk...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Belum ada produk untuk direview.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.vendor_store_name || "Vendor"} · {item.category_name || "Kategori belum ada"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.approval_status)}`}>
                    {item.approval_status}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{item.description || "Tidak ada deskripsi"}</p>
                  <p>Harga: {formatIDR(Number(item.price || 0))}</p>
                  <p>Voucher price: {formatIDR(Number(item.voucher_price || 0))}</p>
                  <p>Stok: {item.stock_quantity} {item.unit}</p>
                  <p>ID: {shortId(item.id)}</p>
                  <p>Dibuat: {formatDateTime(item.created_at)}</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void updateApproval(item.id, "approved")} disabled={mutatingId === item.id}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void updateApproval(item.id, "rejected")}
                    disabled={mutatingId === item.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}