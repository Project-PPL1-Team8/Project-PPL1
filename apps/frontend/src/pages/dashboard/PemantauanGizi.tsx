import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity, Plus, Baby, Loader2, Trash2, Pencil, Calendar,
  AlertCircle, TrendingUp, ChevronLeft, ChevronRight,
  Scale, Ruler, Heart, ShieldCheck,
} from "lucide-react";
import { useStaggerChildren } from "@/hooks/useStaggerChildren";
import {
  addMeasurement,
  getChildren,
  getMeasurementHistory,
  updateMeasurement,
  deleteMeasurement,
  addChild,
} from "@/services/nutrition";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────
type ChildData = {
  id: string;
  full_name: string;
  date_of_birth: string;
  age_months: number;
  gender: string | null;
};

type Measurement = {
  id: string;
  child_id: string;
  measurement_date: string;
  weight: number;
  height: number;
  muac: number | null;
  z_score_weight: number | null;
  z_score_height: number | null;
  classification: string;
};

// ── Status helpers ────────────────────────────────────────────
const classificationConfig: Record<string, {
  label: string; cls: string; bg: string; border: string; desc: string; icon: React.ElementType;
}> = {
  normal: {
    label: "Normal", cls: "text-green-700", bg: "bg-green-50", border: "border-green-200",
    desc: "Status gizi baik", icon: ShieldCheck,
  },
  moderate_malnourished: {
    label: "Kurang Gizi", cls: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200",
    desc: "Perlu perhatian lebih", icon: AlertCircle,
  },
  severe_malnourished: {
    label: "Gizi Buruk", cls: "text-red-700", bg: "bg-red-50", border: "border-red-200",
    desc: "Butuh penanganan segera", icon: Heart,
  },
};

const getClassCfg = (cl: string) =>
  classificationConfig[cl] ?? {
    label: cl || "Belum diukur", cls: "text-muted-foreground", bg: "bg-secondary",
    border: "border-border", desc: "", icon: Activity,
  };

const getGenderLabel = (gender: string | null) => {
  if (gender === "male") return "Laki-laki";
  if (gender === "female") return "Perempuan";
  return "-";
};

const getInitial = (name: string) => name?.trim()?.charAt(0)?.toUpperCase() || "A";

const getLatestMeasurementFromList = (items: Measurement[] = []) =>
  [...items].sort(
    (a, b) =>
      new Date(b.measurement_date).getTime() -
      new Date(a.measurement_date).getTime()
  )[0];

// ── Child List Row ────────────────────────────────────────────
function ChildCard({
  child,
  latestMeasurement,
  isSelected,
  onClick,
}: {
  child: ChildData;
  latestMeasurement: Measurement | undefined;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = latestMeasurement ? getClassCfg(latestMeasurement.classification) : null;
  const StatusIcon = cfg?.icon ?? Baby;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
      className={`
        group relative w-full cursor-pointer overflow-hidden rounded-2xl border text-left transition-all duration-200
        ${isSelected
          ? "border-green-300 bg-green-50/70 shadow-sm ring-1 ring-green-100"
          : "border-border bg-background hover:border-green-200 hover:bg-green-50/30"
        }
      `}
    >
      {isSelected && (
        <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4">
        <div
          className={`
            flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold sm:h-12 sm:w-12
            ${isSelected
              ? "border-green-200 bg-green-100 text-green-800"
              : "border-border bg-secondary text-muted-foreground"
            }
          `}
        >
          {getInitial(child.full_name)}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="max-w-[150px] truncate text-sm font-bold text-foreground min-[420px]:max-w-none">{child.full_name}</p>
            {cfg ? (
              <Badge
                variant="outline"
                className={`h-6 gap-1 rounded-full border px-2 text-[10px] ${cfg.bg} ${cfg.cls} ${cfg.border}`}
              >
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-6 rounded-full border-border bg-secondary px-2 text-[10px] text-muted-foreground"
              >
                Belum ada data
              </Badge>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {child.age_months} bulan · {getGenderLabel(child.gender)}
          </p>
        </div>

        <div className="col-span-2 mt-1 rounded-xl bg-background/70 px-3 py-2 sm:col-span-1 sm:mt-0 sm:min-w-[140px] sm:text-right">
          <p className="text-[10px] font-medium text-muted-foreground">Pengukuran terakhir</p>
          <p className={`mt-0.5 text-xs font-bold ${latestMeasurement ? "text-primary" : "text-muted-foreground"}`}>
            {latestMeasurement
              ? formatDate(latestMeasurement.measurement_date)
              : "Belum ada data"}
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
const PemantauanGizi = () => {
  const { user } = useAuth();
  const gridRef = useStaggerChildren({ stagger: 0.1 });

  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<Measurement | null>(null);
  const [deletingMeasurement, setDeletingMeasurement] = useState<Measurement | null>(null);
  const [children, setChildren] = useState<ChildData[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildData | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [latestMeasurementsByChild, setLatestMeasurementsByChild] = useState<
    Record<string, Measurement | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [chartPage, setChartPage] = useState(0);
  const measurementsPerPage = 10;

  // Form
  const [formWeight, setFormWeight] = useState("");
  const [formHeight, setFormHeight] = useState("");
  const [formMuac, setFormMuac] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formErrors, setFormErrors] = useState<{ weight?: string; height?: string; date?: string }>({});

  // Add child
  const [showAddChild, setShowAddChild] = useState(false);
  const [childFormName, setChildFormName] = useState("");
  const [childFormDob, setChildFormDob] = useState("");
  const [childFormGender, setChildFormGender] = useState<"male" | "female">("male");
  const [childFormErrors, setChildFormErrors] = useState<{ name?: string; dob?: string }>({});

  const fetchLatestMeasurementsForChildren = useCallback(async (childList: ChildData[]) => {
    if (childList.length === 0) {
      setLatestMeasurementsByChild({});
      return;
    }

    const entries = await Promise.all(
      childList.map(async (child) => {
        try {
          const result = await getMeasurementHistory(child.id);
          const latest = getLatestMeasurementFromList(result?.measurements || []);
          return [child.id, latest] as const;
        } catch {
          return [child.id, undefined] as const;
        }
      })
    );

    setLatestMeasurementsByChild(Object.fromEntries(entries));
  }, []);

  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getChildren();
      const childList = Array.isArray(data) ? data : [];

      setChildren(childList);
      setSelectedChild((current) => current ?? childList[0] ?? null);
      await fetchLatestMeasurementsForChildren(childList);
    } catch (err: unknown) {
      toast.error("Gagal memuat data anak", { description: err instanceof Error ? err.message : undefined });
      setChildren([]);
      setLatestMeasurementsByChild({});
    } finally {
      setLoading(false);
    }
  }, [fetchLatestMeasurementsForChildren]);

  useEffect(() => { if (user) fetchChildren(); }, [user, fetchChildren]);

  const fetchMeasurements = useCallback(async (childId: string) => {
    try {
      setLoading(true);
      const result = await getMeasurementHistory(childId);
      const list = result?.measurements || [];
      setMeasurements(
        [...list].sort(
          (a, b) =>
            new Date(b.measurement_date).getTime() -
            new Date(a.measurement_date).getTime()
        )
      );
    } catch (err: unknown) {
      toast.error("Gagal memuat data pengukuran", { description: err instanceof Error ? err.message : undefined });
      setMeasurements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user && selectedChild) fetchMeasurements(selectedChild.id); }, [user, selectedChild, fetchMeasurements]);

  const validateForm = (): boolean => {
    const errors: { weight?: string; height?: string; date?: string } = {};
    const weight = parseFloat(formWeight);
    const height = parseFloat(formHeight);
    if (!formWeight || isNaN(weight) || weight <= 0) errors.weight = "Berat badan harus lebih dari 0 kg";
    else if (weight > 100) errors.weight = "Berat badan tidak realistis (>100 kg)";
    if (!formHeight || isNaN(height) || height <= 0) errors.height = "Tinggi badan harus lebih dari 0 cm";
    else if (height > 200) errors.height = "Tinggi badan tidak realistis (>200 cm)";
    if (!formDate) errors.date = "Tanggal pengukuran wajib diisi";
    else {
      const inputDate = new Date(formDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (inputDate > today) errors.date = "Tanggal tidak boleh di masa depan";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormWeight(""); setFormHeight(""); setFormMuac("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormErrors({}); setEditingMeasurement(null);
  };

  const handleAddMeasurement = async () => {
    if (!validateForm() || !selectedChild) {
      if (!selectedChild) toast.error("Silakan pilih anak terlebih dahulu");
      return;
    }
    setSubmitting(true);
    try {
      const weight = parseFloat(formWeight);
      const height = parseFloat(formHeight);
      const existingOnDate = measurements.find((m) => m.measurement_date === formDate && m.id !== editingMeasurement?.id);
      if (existingOnDate && !editingMeasurement) {
        toast.error("Sudah ada pengukuran pada tanggal ini", { description: "Silakan edit pengukuran yang sudah ada" });
        setSubmitting(false);
        return;
      }
      if (editingMeasurement) {
        await updateMeasurement(editingMeasurement.id, { child_id: selectedChild.id, measurement_date: formDate, weight, height, muac: formMuac ? parseFloat(formMuac) : undefined });
        toast.success("Data pengukuran berhasil diperbarui");
      } else {
        await addMeasurement({ child_id: selectedChild.id, measurement_date: formDate, weight, height, muac: formMuac ? parseFloat(formMuac) : undefined });
        toast.success("Data pengukuran berhasil disimpan");
      }
      resetForm(); setShowForm(false);
      await fetchMeasurements(selectedChild.id);
      await fetchLatestMeasurementsForChildren(children);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan data");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (m: Measurement) => {
    setEditingMeasurement(m);
    setFormWeight(m.weight.toString()); setFormHeight(m.height.toString());
    setFormMuac(m.muac?.toString() || ""); setFormDate(m.measurement_date);
    setShowForm(true);
  };

  const handleDeleteClick = (m: Measurement) => { setDeletingMeasurement(m); setShowDeleteConfirm(true); };

  const handleConfirmDelete = async () => {
    if (!deletingMeasurement) return;
    try {
      await deleteMeasurement(deletingMeasurement.id);
      toast.success("Data pengukuran berhasil dihapus");
      setShowDeleteConfirm(false); setDeletingMeasurement(null);
      if (selectedChild) await fetchMeasurements(selectedChild.id);
      await fetchLatestMeasurementsForChildren(children);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus data");
    }
  };

  const handleAddChild = async () => {
    const errors: { name?: string; dob?: string } = {};
    if (!childFormName.trim()) errors.name = "Nama anak wajib diisi";
    if (!childFormDob) errors.dob = "Tanggal lahir wajib diisi";
    else if (new Date(childFormDob) > new Date()) errors.dob = "Tanggal lahir tidak boleh di masa depan";
    setChildFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      setSubmitting(true);
      await addChild({ full_name: childFormName.trim(), date_of_birth: childFormDob, gender: childFormGender });
      toast.success("Anak berhasil ditambahkan");
      setShowAddChild(false); setChildFormName(""); setChildFormDob("");
      setChildFormGender("male"); setChildFormErrors({});
      await fetchChildren();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menambahkan anak");
    } finally {
      setSubmitting(false);
    }
  };

  // Chart
  const paginatedMeasurements = useMemo(() => {
    const start = chartPage * measurementsPerPage;
    return measurements.slice(start, start + measurementsPerPage);
  }, [measurements, chartPage]);

  const totalChartPages = Math.ceil(measurements.length / measurementsPerPage);

  const chartData = useMemo(() =>
    [...paginatedMeasurements].reverse().map((m) => ({
      month: formatDate(m.measurement_date).split(" ")[0] || m.measurement_date,
      weight: parseFloat(m.weight.toString()),
      height: parseFloat(m.height.toString()),
      z_score: m.z_score_weight,
    })),
    [paginatedMeasurements]
  );

  const latestMeasurement = useMemo(() =>
    getLatestMeasurementFromList(
      measurements.filter((m) => selectedChild && m.child_id === selectedChild.id)
    ),
    [measurements, selectedChild]
  );

  const latestCfg = latestMeasurement ? getClassCfg(latestMeasurement.classification) : null;
  const LatestIcon = latestCfg?.icon ?? Activity;

  // ── Skeleton ─────────────────────────────────────────────────
  if (loading && children.length === 0) {
    return (
      <DashboardLayout title="Pemantauan Gizi" subtitle="Pantau tumbuh kembang dan status gizi anak Anda.">
        <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-64 animate-pulse rounded bg-secondary" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-32 animate-pulse rounded-xl bg-secondary" />
              <div className="h-9 w-36 animate-pulse rounded-xl bg-secondary" />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
            <div className="h-64 animate-pulse rounded-3xl border bg-card" />
            <div className="h-64 animate-pulse rounded-3xl border bg-card" />
          </div>

          <div className="h-36 animate-pulse rounded-3xl border bg-card" />
          <div className="h-72 animate-pulse rounded-3xl border bg-card" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Pemantauan Gizi" subtitle="Pantau tumbuh kembang dan status gizi anak Anda.">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-5">

        {/* Top Actions */}
        <div className="-mt-14 mb-4 flex justify-end max-md:mt-0 max-md:mb-3">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full gap-2 rounded-xl px-4 font-semibold sm:w-auto"
              onClick={() => setShowAddChild(true)}
            >
              <Plus className="h-4 w-4" />
              Tambah Anak
            </Button>
            <Button
              size="sm"
              className="h-10 w-full gap-2 rounded-xl px-4 font-semibold shadow-sm sm:w-auto"
              onClick={() => setShowForm(true)}
              disabled={!selectedChild}
            >
              <Plus className="h-4 w-4" />
              Input Pengukuran
            </Button>
          </div>
        </div>

        {/* ── Empty Children State ── */}
        {children.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-sm sm:rounded-3xl sm:px-8 sm:py-16">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Baby className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-foreground">Belum Ada Data Anak</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              Tambahkan data anak untuk memulai pemantauan gizi.
            </p>
            <Button onClick={() => setShowAddChild(true)} className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Tambah Data Anak
            </Button>
          </div>
        ) : (
          <>
            {/* ── Master Detail Area ── */}
            <div ref={gridRef} className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">

              {/* Daftar Anak */}
              <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm sm:rounded-3xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Daftar Anak</CardTitle>
                  <CardDescription className="text-xs">
                    Pilih anak untuk melihat detail dan riwayat pengukuran.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {children.map((child) => {
                    const latestForChild = latestMeasurementsByChild[child.id];

                    return (
                      <ChildCard
                        key={child.id}
                        child={child}
                        latestMeasurement={latestForChild}
                        isSelected={selectedChild?.id === child.id}
                        onClick={() => setSelectedChild(child)}
                      />
                    );
                  })}
                </CardContent>
              </Card>

              {/* Ringkasan Anak Terpilih */}
              <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm sm:rounded-3xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-bold">
                    Ringkasan {selectedChild?.full_name || "Anak"}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-green-200 bg-green-100 text-base font-bold text-green-800 sm:h-16 sm:w-16 sm:text-lg">
                        {selectedChild ? getInitial(selectedChild.full_name) : "A"}
                      </div>

                      <div>
                        <h3 className="text-lg font-bold leading-tight text-foreground sm:text-xl">
                          {selectedChild?.full_name || "-"}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedChild?.age_months ?? "-"} bulan
                          {selectedChild?.age_months ? ` (${Math.floor(selectedChild.age_months / 12)} tahun)` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getGenderLabel(selectedChild?.gender ?? null)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      {latestCfg ? (
                        <>
                          <Badge
                            variant="outline"
                            className={`h-8 gap-1.5 rounded-full border px-4 text-xs font-semibold ${latestCfg.bg} ${latestCfg.cls} ${latestCfg.border}`}
                          >
                            <LatestIcon className="h-3.5 w-3.5" />
                            {latestCfg.label}
                          </Badge>
                          {latestCfg.desc && (
                            <p className="text-xs text-muted-foreground">{latestCfg.desc}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <Badge
                            variant="outline"
                            className="h-8 rounded-full border-border bg-secondary px-4 text-xs text-muted-foreground"
                          >
                          Belum ada data
                          </Badge>
                          <p className="text-xs text-muted-foreground">Belum ada pengukuran</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 min-[420px]:grid-cols-2 2xl:grid-cols-4">
                    {[
                      {
                        icon: Scale,
                        label: "Berat",
                        value: latestMeasurement ? `${latestMeasurement.weight} kg` : "-",
                      },
                      {
                        icon: Ruler,
                        label: "Tinggi",
                        value: latestMeasurement ? `${latestMeasurement.height} cm` : "-",
                      },
                      {
                        icon: Activity,
                        label: "Z-Score",
                        value: latestMeasurement?.z_score_weight !== null && latestMeasurement?.z_score_weight !== undefined
                          ? latestMeasurement.z_score_weight
                          : "-",
                      },
                      {
                        icon: Calendar,
                        label: "Pengukuran terakhir",
                        value: latestMeasurement ? formatDate(latestMeasurement.measurement_date) : "-",
                      },
                    ].map(({ icon: Icon, label, value }) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-border/80 bg-background p-3 shadow-sm sm:p-4"
                      >
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="mt-1 text-lg font-bold text-foreground sm:text-xl">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Measurement History Table ── */}
            {measurements.length > 0 && (
              <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm sm:rounded-3xl">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <Activity className="h-4 w-4 text-primary" />
                        Riwayat Pengukuran
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {selectedChild?.full_name} — {measurements.length} data
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 rounded-xl px-4 text-xs font-semibold"
                      onClick={() => setShowForm(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="border-y border-border bg-secondary/30">
                          <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Tanggal</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Berat (kg)</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Tinggi (cm)</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Z-Score</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Aksi</th>
                        </tr>
                      </thead>

                      <tbody>
                        {measurements.slice(0, 8).map((m) => {
                          const cfg = getClassCfg(m.classification);
                          return (
                            <tr
                              key={m.id}
                              className="border-b border-border/60 last:border-0 hover:bg-secondary/20"
                            >
                              <td className="px-5 py-4 text-xs text-muted-foreground">
                                {formatDate(m.measurement_date)}
                              </td>
                              <td className="px-5 py-4 text-sm font-bold text-foreground">
                                {m.weight} kg
                              </td>
                              <td className="px-5 py-4 text-sm font-bold text-foreground">
                                {m.height} cm
                              </td>
                              <td className="px-5 py-4 text-sm font-bold text-foreground">
                                {m.z_score_weight ?? "-"}
                              </td>
                              <td className="px-5 py-4">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full border px-3 text-[10px] ${cfg.bg} ${cfg.cls} ${cfg.border}`}
                                >
                                  {cfg.label}
                                </Badge>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 rounded-lg p-0"
                                    onClick={() => handleEditClick(m)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 rounded-lg p-0"
                                    onClick={() => handleDeleteClick(m)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {measurements.length > 8 && (
                    <div className="border-t border-border/60 px-5 py-3 text-center text-xs text-muted-foreground">
                      Dan {measurements.length - 8} data lainnya.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Growth Charts ── */}
            {chartData.length > 0 && selectedChild && (
              <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm sm:rounded-3xl">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Grafik Tumbuh Kembang — {selectedChild.full_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Perkembangan berat & tinggi badan dengan referensi WHO
                      </CardDescription>
                    </div>

                    {totalChartPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline" size="sm" className="h-8 w-8 rounded-lg p-0"
                          onClick={() => setChartPage((p) => Math.max(0, p - 1))}
                          disabled={chartPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">{chartPage + 1}/{totalChartPages}</span>
                        <Button
                          variant="outline" size="sm" className="h-8 w-8 rounded-lg p-0"
                          onClick={() => setChartPage((p) => Math.min(totalChartPages - 1, p + 1))}
                          disabled={chartPage === totalChartPages - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                  <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
                    <div className="rounded-2xl border border-border/70 bg-background p-3 sm:p-4">
                      <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <Scale className="h-3.5 w-3.5" />
                          Berat Badan (kg)
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-4 rounded-full bg-primary" />
                            Pengukuran
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-4 rounded-full border-t border-dashed border-muted-foreground" />
                            Referensi WHO
                          </span>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                          <YAxis tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,90%)", borderRadius: 12 }} />
                          <Line type="monotone" dataKey="weight" stroke="hsl(152,55%,33%)" strokeWidth={2.5} dot={{ fill: "hsl(152,55%,33%)", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-background p-3 sm:p-4">
                      <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <Ruler className="h-3.5 w-3.5" />
                          Tinggi Badan (cm)
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-4 rounded-full bg-primary" />
                            Pengukuran
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-4 rounded-full border-t border-dashed border-muted-foreground" />
                            Referensi WHO
                          </span>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                          <YAxis tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,90%)", borderRadius: 12 }} />
                          <Line type="monotone" dataKey="height" stroke="hsl(152,55%,33%)" strokeWidth={2.5} dot={{ fill: "hsl(152,55%,33%)", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Empty measurement state ── */}
            {measurements.length === 0 && !loading && selectedChild && (
              <div className="rounded-3xl border border-dashed border-border bg-card px-8 py-14 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                  <Activity className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mb-1 font-bold text-foreground">Belum Ada Data Pengukuran</p>
                <p className="mb-5 text-sm text-muted-foreground">
                  Input data berat dan tinggi badan anak untuk memulai pemantauan.
                </p>
                <Button onClick={() => setShowForm(true)} className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Input Pengukuran
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Add/Edit Measurement Dialog ── */}
        <Dialog open={showForm} onOpenChange={(open: boolean) => { if (!open) resetForm(); setShowForm(open); }}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {editingMeasurement ? "Edit" : "Input"} Pengukuran — {selectedChild?.full_name || "Anak"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Anak</Label>
                <Select
                  value={selectedChild?.id || ""}
                  onValueChange={(v: string) => { const child = children.find((c) => c.id === v); if (child) setSelectedChild(child); }}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih anak" /></SelectTrigger>
                  <SelectContent>
                    {children.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Tanggal Pengukuran</Label>
                <Input type="date" value={formDate} onChange={(e) => { setFormDate(e.target.value); setFormErrors((p) => ({ ...p, date: undefined })); }} max={new Date().toISOString().split("T")[0]} />
                {formErrors.date && <p className="text-xs text-destructive mt-1">{formErrors.date}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Berat Badan (kg)</Label>
                  <Input type="number" value={formWeight} onChange={(e) => { setFormWeight(e.target.value); setFormErrors((p) => ({ ...p, weight: undefined })); }} placeholder="0.0" step="0.1" min="0.1" max="100" />
                  {formErrors.weight && <p className="text-xs text-destructive mt-1">{formErrors.weight}</p>}
                </div>
                <div>
                  <Label>Tinggi Badan (cm)</Label>
                  <Input type="number" value={formHeight} onChange={(e) => { setFormHeight(e.target.value); setFormErrors((p) => ({ ...p, height: undefined })); }} placeholder="0.0" step="0.1" min="1" max="200" />
                  {formErrors.height && <p className="text-xs text-destructive mt-1">{formErrors.height}</p>}
                </div>
              </div>
              <div>
                <Label>MUAC (cm) — Opsional</Label>
                <Input type="number" value={formMuac} onChange={(e) => setFormMuac(e.target.value)} placeholder="0.0" step="0.1" min="1" max="50" />
                <p className="text-xs text-muted-foreground mt-1">Lingkar Lengan Atas (untuk deteksi gizi buruk)</p>
              </div>
              <Button className="w-full" onClick={handleAddMeasurement} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {submitting ? "Menyimpan..." : editingMeasurement ? "Perbarui Pengukuran" : "Simpan Pengukuran"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirm ── */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" /> Hapus Pengukuran?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Data pengukuran tanggal <strong>{deletingMeasurement && formatDate(deletingMeasurement.measurement_date)}</strong> akan dihapus permanen. Lanjutkan?
            </p>
            <div className="mt-2 grid gap-2 sm:flex">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Batal</Button>
              <Button variant="destructive" className="flex-1" onClick={handleConfirmDelete}>Hapus</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Add Child Dialog ── */}
        <Dialog open={showAddChild} onOpenChange={(open: boolean) => { if (!open) { setChildFormName(""); setChildFormDob(""); setChildFormGender("male"); setChildFormErrors({}); } setShowAddChild(open); }}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Baby className="h-5 w-5 text-primary" /> Tambah Data Anak
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nama Lengkap Anak</Label>
                <Input value={childFormName} onChange={(e) => { setChildFormName(e.target.value); setChildFormErrors((p) => ({ ...p, name: undefined })); }} placeholder="Contoh: Budi Santoso" />
                {childFormErrors.name && <p className="text-xs text-destructive mt-1">{childFormErrors.name}</p>}
              </div>
              <div>
                <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Tanggal Lahir</Label>
                <Input type="date" value={childFormDob} onChange={(e) => { setChildFormDob(e.target.value); setChildFormErrors((p) => ({ ...p, dob: undefined })); }} max={new Date().toISOString().split("T")[0]} />
                {childFormErrors.dob && <p className="text-xs text-destructive mt-1">{childFormErrors.dob}</p>}
              </div>
              <div>
                <Label>Jenis Kelamin</Label>
                <Select value={childFormGender} onValueChange={(v: "male" | "female") => setChildFormGender(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Laki-laki</SelectItem>
                    <SelectItem value="female">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleAddChild} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {submitting ? "Menyimpan..." : "Tambah Anak"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PemantauanGizi;