import { useCallback, useEffect, useMemo, useState } from "react";
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
  page: number;
  page_size: number;
  total_pages: number;
};

type StoreSummary = {
  vendor_id: string;
  vendor_store_name: string;
  totalProducts: number;
  pendingProducts: number;
  approvedProducts: number;
  rejectedProducts: number;
  latestCreatedAt: string;
  items: ProductReviewItem[];
};

const PRODUCT_PAGE_SIZE = 100;

export default function AdminProductsPage() {
  const [items, setItems] = useState<ProductReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const fetchPage = async (page: number) => {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(PRODUCT_PAGE_SIZE),
        });

        return (await apiFetch(`/admin/products/reviews?${params.toString()}`)) as ProductReviewListResponse;
      };

      const firstPage = await fetchPage(1);
      const totalPages = firstPage.total_pages || (firstPage.total ? Math.ceil(firstPage.total / PRODUCT_PAGE_SIZE) : 0);
      const allItems = [...(firstPage.items || [])];

      if (totalPages > 1) {
        const extraPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2))
        );

        extraPages.forEach((pageData) => {
          allItems.push(...(pageData.items || []));
        });
      }

      setItems(allItems);
    } catch (err: any) {
      const message = err?.message || "Gagal memuat review produk";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const stores = useMemo<StoreSummary[]>(() => {
    const storeMap = new Map<string, StoreSummary>();

    items.forEach((item) => {
      const storeId = item.vendor_id;
      const storeName = item.vendor_store_name || "Vendor";
      let store = storeMap.get(storeId);

      if (!store) {
        store = {
          vendor_id: storeId,
          vendor_store_name: storeName,
          totalProducts: 0,
          pendingProducts: 0,
          approvedProducts: 0,
          rejectedProducts: 0,
          latestCreatedAt: item.created_at,
          items: [],
        };
        storeMap.set(storeId, store);
      }

      store.totalProducts += 1;
      store.items.push(item);

      if (new Date(item.created_at).getTime() > new Date(store.latestCreatedAt).getTime()) {
        store.latestCreatedAt = item.created_at;
      }

      switch (item.approval_status) {
        case "approved":
          store.approvedProducts += 1;
          break;
        case "rejected":
          store.rejectedProducts += 1;
          break;
        default:
          store.pendingProducts += 1;
          break;
      }
    });

    return Array.from(storeMap.values()).sort((left, right) => {
      if (right.totalProducts !== left.totalProducts) {
        return right.totalProducts - left.totalProducts;
      }

      return left.vendor_store_name.localeCompare(right.vendor_store_name, "id");
    });
  }, [items]);

  const selectedStore = useMemo(
    () => stores.find((store) => store.vendor_id === selectedStoreId) || null,
    [stores, selectedStoreId]
  );

  useEffect(() => {
    if (selectedStoreId && !stores.some((store) => store.vendor_id === selectedStoreId)) {
      setSelectedStoreId(null);
    }
  }, [selectedStoreId, stores]);

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

  const visibleProducts = selectedStore?.items || [];
  const productStats = {
    totalStores: stores.length,
    totalProducts: items.length,
    pendingProducts: items.filter((item) => item.approval_status === "pending").length,
  };

  return (
    <DashboardLayout title="Kelola Produk" subtitle="Mulai dari daftar toko, lalu buka produk di dalam toko tersebut.">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-2xl font-semibold text-foreground">{productStats.totalStores}</div>
            <p className="text-sm text-muted-foreground">Toko aktif</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-2xl font-semibold text-foreground">{productStats.totalProducts}</div>
            <p className="text-sm text-muted-foreground">Total produk</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-2xl font-semibold text-foreground">{productStats.pendingProducts}</div>
            <p className="text-sm text-muted-foreground">Produk pending</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {selectedStore
              ? `Menampilkan seluruh produk dari ${selectedStore.vendor_store_name}, termasuk yang belum di-approve.`
              : "Klik toko untuk melihat produk di dalamnya. Semua status approval tetap tampil."}
          </p>
          <div className="flex items-center gap-2">
            {selectedStore ? (
              <Button variant="outline" onClick={() => setSelectedStoreId(null)}>
                Kembali ke daftar toko
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void loadProducts()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : loading && items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Memuat data produk...</div>
        ) : stores.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Belum ada produk untuk ditampilkan.
          </div>
        ) : selectedStore ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-xl font-semibold text-foreground">{selectedStore.vendor_store_name}</h3>
                <p className="text-sm text-muted-foreground">
                  Vendor ID {shortId(selectedStore.vendor_id)} · diperbarui {formatDateTime(selectedStore.latestCreatedAt)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Total {selectedStore.totalProducts}</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1">Pending {selectedStore.pendingProducts}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">Approved {selectedStore.approvedProducts}</span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">Rejected {selectedStore.rejectedProducts}</span>
              </div>
            </div>

            {visibleProducts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-slate-50 p-6 text-sm text-muted-foreground">
                Tidak ada produk pada toko ini.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleProducts.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-foreground">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">{item.category_name || "Kategori belum ada"}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.approval_status)}`}>
                        {item.approval_status}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>{item.description || "Tidak ada deskripsi"}</p>
                      <p>Harga: {formatIDR(Number(item.price || 0))}</p>
                      <p>Voucher price: {formatIDR(Number(item.voucher_price || 0))}</p>
                      <p>
                        Stok: {item.stock_quantity} {item.unit}
                      </p>
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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <button
                key={store.vendor_id}
                type="button"
                onClick={() => setSelectedStoreId(store.vendor_id)}
                className={`rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                  selectedStoreId === store.vendor_id ? "border-primary ring-2 ring-primary/20" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{store.vendor_store_name}</h3>
                    <p className="text-sm text-muted-foreground">Vendor ID {shortId(store.vendor_id)}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {store.totalProducts} produk
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span className="rounded-xl bg-slate-50 px-3 py-2">Approved {store.approvedProducts}</span>
                  <span className="rounded-xl bg-amber-50 px-3 py-2">Pending {store.pendingProducts}</span>
                  <span className="rounded-xl bg-rose-50 px-3 py-2">Rejected {store.rejectedProducts}</span>
                  <span className="rounded-xl bg-slate-50 px-3 py-2">Updated {formatDateTime(store.latestCreatedAt)}</span>
                </div>

                <div className="mt-4 text-sm font-medium text-primary">Lihat produk toko</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
