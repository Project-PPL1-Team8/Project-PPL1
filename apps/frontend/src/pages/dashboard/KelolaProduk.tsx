import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Edit, Trash2, Package, Loader2, ShoppingBag, CheckCircle, Clock,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} from "@/services/products";
import type { VendorProduct } from "@/types/vendor";
import type { Category } from "@/services/products";
import { toast } from "sonner";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { ListItemSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { KpiCard, KpiCardGrid } from "@/components/dashboard/KpiCard";
import { productApprovalConfig } from "@/lib/status-config";

interface ProductFormState {
  name: string;
  category: string;
  price: string;
  voucherPrice: string;
  stock: string;
  unit: string;
}

const DEFAULT_FORM: ProductFormState = {
  name: "",
  category: "",
  price: "",
  voucherPrice: "",
  stock: "",
  unit: "pcs",
};

const KelolaProduk = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProductFormState>(DEFAULT_FORM);

  const setField = (key: keyof ProductFormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [productsData, catsData] = await Promise.all([
        getProducts({ vendor_id: user?.id || "" }),
        getCategories(),
      ]);
      setProducts(productsData.items || []);
      setCategories(catsData || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat data produk";
      setError(msg);
      toast.error("Gagal memuat data produk");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) => !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase())
      ),
    [products, searchQ]
  );

  const activeCount = useMemo(
    () => products.filter((p) => p.approval_status === "approved").length,
    [products]
  );
  const pendingCount = useMemo(
    () => products.filter((p) => p.approval_status === "pending").length,
    [products]
  );

  const openForm = (product?: VendorProduct) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        name: product.name,
        category: product.category || "",
        price: String(product.price),
        voucherPrice: String(product.voucher_price),
        stock: String(product.stock),
        unit: product.unit,
      });
    } else {
      setEditingProduct(null);
      setForm(DEFAULT_FORM);
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price || form.voucherPrice === "") {
      toast.error("Lengkapi semua field wajib");
      return;
    }
    const priceNum = parseFloat(form.price);
    const voucherPriceNum = parseFloat(form.voucherPrice);
    if (voucherPriceNum < 0) {
      toast.error("Harga voucher tidak boleh negatif");
      return;
    }
    if (voucherPriceNum > priceNum) {
      toast.error("Harga voucher tidak boleh melebihi harga produk");
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        name: form.name,
        category_id: form.category || undefined,
        price: priceNum,
        voucher_price: voucherPriceNum,
        stock_quantity: parseInt(form.stock) || 0,
        unit: form.unit,
      };
      if (editingProduct) {
        await updateProduct(editingProduct.id, data);
        toast.success("Produk diperbarui");
      } else {
        await createProduct(data);
        toast.success("Produk ditambahkan");
      }
      setShowForm(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan produk";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (product: VendorProduct) => {
    if (!window.confirm(`Hapus "${product.name}"?`)) return;
    try {
      await deleteProduct(product.id);
      toast.success(`"${product.name}" dihapus`);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus produk";
      toast.error(msg);
    }
  };

  const discountPct = useMemo(() => {
    const p = parseFloat(form.price);
    const vp = parseFloat(form.voucherPrice);
    if (!p || !vp || p === 0) return 0;
    return Math.round((1 - vp / p) * 100);
  }, [form.price, form.voucherPrice]);

  if (loading) {
    return (
      <DashboardLayout title="Kelola Produk" subtitle="Tambah, edit, dan kelola produk pangan Anda.">
        <div className="space-y-3">
          <ListItemSkeleton count={4} />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Kelola Produk" subtitle="Tambah, edit, dan kelola produk pangan Anda.">
        <ErrorState message={error} onRetry={fetchData} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Kelola Produk" subtitle="Tambah, edit, dan kelola produk pangan Anda.">
      <div className="space-y-5">
        {/* Stats Row */}
        <KpiCardGrid columns={3}>
          <KpiCard icon={ShoppingBag} label="Total Produk" value={products.length.toString()} variant="indigo" />
          <KpiCard icon={CheckCircle} label="Disetujui" value={activeCount.toString()} variant="green" />
          <KpiCard icon={Clock} label="Menunggu Tinjauan" value={pendingCount.toString()} variant="amber" />
        </KpiCardGrid>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari produk..."
              className="pl-9 rounded-xl"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <Button
            className="gap-2 flex-shrink-0 bg-indigo-600 hover:bg-indigo-700"
            onClick={() => openForm()}
          >
            <Plus className="h-4 w-4" /> Tambah Produk
          </Button>
        </div>

        {/* Product List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card text-center py-14">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground mb-1">Tidak ada produk ditemukan</p>
            <p className="text-sm text-muted-foreground mb-5">
              {searchQ ? "Coba kata kunci lain" : "Mulai tambahkan produk pangan Anda"}
            </p>
            {!searchQ && (
              <Button
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                onClick={() => openForm()}
              >
                <Plus className="h-4 w-4" /> Tambah Produk Pertama
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border/50">
              {filtered.map((product) => {
                const ac =
                  productApprovalConfig[product.approval_status as keyof typeof productApprovalConfig] ||
                  productApprovalConfig.pending;
                const ACIcon = ac.icon;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200">
                      <Package className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground line-clamp-1">
                        {product.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {product.category && (
                          <Badge variant="outline" className="text-[9px] bg-secondary border-border">
                            {product.category}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[9px] border gap-0.5 ${ac.className}`}>
                          <ACIcon className="h-2.5 w-2.5" />
                          {ac.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 mr-2">
                      <div className="text-sm font-bold text-foreground">{formatIDR(product.price)}</div>
                      <div className="text-xs text-muted-foreground">
                        Stok: {product.stock} {product.unit}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => openForm(product)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-muted-foreground"
                        title="Edit produk"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground"
                        title="Hapus produk"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Produk" : "Tambah Produk Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">
                Nama Produk <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name")(e.target.value)}
                placeholder="Contoh: Telur Ayam 1 kg"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Kategori</Label>
              <Select value={form.category} onValueChange={setField("category")}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">
                  Harga (IDR) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setField("price")(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">
                  Harga Voucher (IDR) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.voucherPrice}
                  onChange={(e) => setField("voucherPrice")(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Stok</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setField("stock")(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Satuan</Label>
                <Select value={form.unit} onValueChange={setField("unit")}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pcs</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="liter">Liter</SelectItem>
                    <SelectItem value="ikat">Ikat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.price && form.voucherPrice && discountPct >= 0 && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-700">
                💡 Diskon voucher: <strong>{discountPct}%</strong> dari harga normal
              </div>
            )}
            <Button
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : editingProduct ? (
                "Simpan Perubahan"
              ) : (
                "Tambah Produk"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default KelolaProduk;
