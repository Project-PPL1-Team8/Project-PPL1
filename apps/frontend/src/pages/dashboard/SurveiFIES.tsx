import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  ListChecks,
  Clock,
  CalendarDays,
  ShieldCheck,
  Star,
  History,
  ClipboardX,
} from "lucide-react";
import { submitFies, getFiesHistory } from "@/services/fies";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

const fiesQuestions = [
  "Dalam 30 hari terakhir, apakah Anda khawatir makanan akan habis sebelum bisa membeli lagi?",
  "Dalam 30 hari terakhir, apakah Anda tidak bisa makan makanan sehat dan bergizi?",
  "Dalam 30 hari terakhir, apakah Anda hanya makan beberapa jenis makanan saja?",
  "Dalam 30 hari terakhir, apakah Anda harus melewatkan makan karena tidak ada makanan?",
  "Dalam 30 hari terakhir, apakah Anda makan lebih sedikit dari yang seharusnya?",
  "Dalam 30 hari terakhir, apakah rumah Anda kehabisan makanan?",
  "Dalam 30 hari terakhir, apakah Anda lapar tapi tidak makan karena tidak cukup makanan?",
  "Dalam 30 hari terakhir, apakah Anda tidak makan seharian penuh karena tidak cukup makanan?",
];

type Answer = "ya" | "tidak" | null;

const getSeverity = (s: number) => {
  if (s <= 2) {
    return {
      label: "Ketahanan Pangan Baik",
      color: "bg-primary/10 text-primary border-primary/20",
      desc: "Ketahanan pangan Anda dalam kondisi baik.",
    };
  }

  if (s <= 5) {
    return {
      label: "Ketahanan Pangan Sedang",
      color: "bg-accent/10 text-accent-foreground border-accent/20",
      desc: "Ada indikasi kerawanan pangan sedang. Anda akan mendapat prioritas bantuan.",
    };
  }

  return {
    label: "Ketahanan Pangan Buruk",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    desc: "Terdeteksi kerawanan pangan serius. Bantuan Anda akan diprioritaskan segera.",
  };
};

const surveyInfo = [
  {
    icon: ListChecks,
    title: "8 pertanyaan singkat",
    desc: "Dirancang untuk mudah dipahami dan dijawab.",
  },
  {
    icon: Clock,
    title: "Waktu pengerjaan ~3 menit",
    desc: "Hanya membutuhkan beberapa menit saja.",
  },
  {
    icon: CalendarDays,
    title: "Jawab berdasarkan 30 hari terakhir",
    desc: "Jawablah sesuai kondisi dalam 30 hari terakhir.",
  },
  {
    icon: ShieldCheck,
    title: "Diisi minimal 1x setiap bulan",
    desc: "Bantu kami memantau kondisi pangan Anda.",
  },
  {
    icon: Star,
    title: "Hasil menentukan prioritas bantuan",
    desc: "Data Anda membantu penyaluran bantuan tepat sasaran.",
  },
];

const SurveiFIES = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [started, setStarted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(Array(8).fill(null));
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const progress = ((currentQ + 1) / fiesQuestions.length) * 100;
  const score = answers.filter((a) => a === "ya").length;

  useEffect(() => {
    if (user?.id) {
      getFiesHistory(user.id)
        .then((res) => setHistory(res.data?.surveys || []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  }, [user]);

  const handleAnswer = (answer: Answer) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = answer;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (answers[currentQ] === null) {
      toast.error("Pilih jawaban", {
        description: "Silakan pilih Ya atau Tidak",
      });
      return;
    }

    if (currentQ < fiesQuestions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    setSubmitting(true);

    try {
      const responses: Record<string, number> = {};

      answers.forEach((a, i) => {
        responses[`q${i + 1}`] = a === "ya" ? 1 : 0;
      });

      const res = await submitFies({ responses });

      if (res.success) {
        setCompleted(true);
        toast.success("Survei berhasil dikirim!");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim survei");
    } finally {
      setSubmitting(false);
    }
  };

  // — Completed —
  if (completed) {
    const severity = getSeverity(score);

    return (
      <DashboardLayout
        title="Survei FIES"
        subtitle="Survei ketahanan pangan bulanan."
      >
        <div className="w-full max-w-none pb-3">
          <Card className="overflow-hidden rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
            <CardContent className="p-0">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)]">
                <div className="relative overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 p-4 text-primary-foreground sm:p-5 lg:p-6">
                  <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/10 sm:h-52 sm:w-52" />
                  <div className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-black/10 sm:h-56 sm:w-56" />

                  <div className="relative flex min-h-[200px] flex-col justify-between gap-5 sm:min-h-[220px]">
                    <div className="space-y-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-primary shadow-lg sm:h-12 sm:w-12">
                        <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>

                      <div className="space-y-1.5">
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                          Survei Selesai!
                        </h2>

                        <p className="max-w-md text-sm leading-6 text-white/85">
                          Terima kasih telah mengisi survei ketahanan pangan bulan ini.
                        </p>
                      </div>
                    </div>

                    <Button
                      className="h-10 w-full rounded-xl bg-white px-4 text-sm font-semibold text-primary hover:bg-white/90 sm:w-fit"
                      onClick={() => navigate("/dashboard/beneficiary")}
                    >
                      Kembali ke Dashboard
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 sm:p-5 lg:p-6">
                  <div className="rounded-[18px] border border-border/70 bg-secondary/20 p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      Skor FIES Anda
                    </p>

                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                        {score}
                        <span className="text-xl text-muted-foreground sm:text-2xl">
                          {" "}
                          / 8
                        </span>
                      </div>

                      <Badge
                        className={`w-fit rounded-full px-3 py-1 text-[11px] ${severity.color}`}
                      >
                        {severity.label}
                      </Badge>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-muted-foreground sm:text-sm">
                      {severity.desc}
                    </p>
                  </div>

                  {score > 5 && (
                    <div className="mt-3 flex items-start gap-3 rounded-[18px] border border-accent/30 bg-accent/5 p-3.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          Bantuan Diprioritaskan
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Berdasarkan skor FIES Anda, alokasi voucher nutrisi akan
                          diprioritaskan untuk keluarga Anda.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // — Start screen —
  if (!started) {
    return (
      <DashboardLayout
        title="Survei FIES"
        subtitle="Survei ketahanan pangan bulanan."
      >
        <div className="w-full max-w-none space-y-3 pb-3">
          <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
            {/* Hero */}
            <Card className="overflow-hidden rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
              <CardContent className="relative min-h-[190px] bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 p-4 text-primary-foreground sm:min-h-[205px] sm:p-5 lg:min-h-[215px] lg:p-5">
                <div className="absolute right-5 top-5 grid grid-cols-6 gap-1.5 opacity-20">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <span key={i} className="h-1 w-1 rounded-full bg-white" />
                  ))}
                </div>

                <div className="absolute -right-14 bottom-4 h-40 w-40 rounded-full bg-white/10 sm:h-48 sm:w-48" />
                <div className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-black/10 sm:h-48 sm:w-48" />

                <div className="relative z-10 flex h-full min-h-[160px] flex-col justify-between gap-4 sm:min-h-[170px]">
                  <div className="space-y-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-lg shadow-black/10">
                      <ClipboardList className="h-5 w-5" />
                    </div>

                    <div className="max-w-2xl space-y-1.5">
                      <h2 className="max-w-xl text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                        Survei Ketahanan Pangan (FIES)
                      </h2>

                      <p className="max-w-xl text-xs leading-5 text-white/85 sm:text-sm">
                        Survei bulanan untuk mengukur tingkat ketahanan pangan keluarga Anda.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setStarted(true)}
                    className="h-9 w-full rounded-xl bg-white px-4 text-xs font-semibold text-primary shadow-lg shadow-black/10 hover:bg-white/90 sm:w-fit"
                  >
                    Mulai Survei
                    <ChevronRight className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
              <CardContent className="p-4">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Info className="h-4 w-4 text-primary" />
                  </div>

                  <h3 className="text-sm font-bold text-foreground">
                    Tentang survei ini
                  </h3>
                </div>

                <div className="divide-y divide-border/70">
                  {surveyInfo.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.title}
                        className="flex gap-2.5 py-2 first:pt-0 last:pb-0"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight text-foreground">
                            {item.title}
                          </p>

                          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* History */}
          <Card className="overflow-hidden rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
            <CardContent className="p-4">
              <div className="mb-2.5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <History className="h-4 w-4 text-primary" />
                </div>

                <h3 className="text-sm font-bold text-foreground">
                  Riwayat Survei
                </h3>
              </div>

              {historyLoading ? (
                <div className="space-y-2 rounded-[16px] border border-border/70 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex animate-pulse items-center justify-between"
                    >
                      <div className="h-3 w-28 rounded bg-secondary" />
                      <div className="h-5 w-20 rounded-full bg-secondary" />
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="grid min-h-[78px] place-items-center rounded-[16px] border border-border/70 bg-gradient-to-br from-background to-secondary/20 p-3">
                  <div className="flex w-full max-w-2xl flex-col items-center justify-center gap-2.5 text-center sm:flex-row sm:text-left">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <ClipboardX className="h-5 w-5 text-primary/40" />
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground">
                        Belum ada riwayat survei
                      </h4>

                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        Mulai survei pertama Anda untuk membantu kami memahami
                        kondisi ketahanan pangan keluarga Anda.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[16px] border border-border/70">
                  {history.map((h: any) => {
                    const severity = getSeverity(h.score);

                    return (
                      <div
                        key={h.id}
                        className="flex flex-col gap-2 border-b border-border/50 px-3 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-xs text-muted-foreground">
                          {formatDate(h.survey_date)}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {h.score}/8
                          </span>

                          <Badge
                            variant="outline"
                            className={`rounded-full px-2 py-0.5 text-[10px] ${severity.color}`}
                          >
                            {severity.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // — Survey questions —
  return (
    <DashboardLayout
      title="Survei FIES"
      subtitle="Survei ketahanan pangan bulanan."
    >
      <div className="w-full max-w-none space-y-3 pb-3">
        <Card className="rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)]">
          <CardContent className="p-3.5 sm:p-4">
            <div className="mb-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">
                  Pertanyaan {currentQ + 1} dari {fiesQuestions.length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Jawab sesuai kondisi 30 hari terakhir.
                </p>
              </div>

              <Badge
                variant="outline"
                className="w-fit shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              >
                {Math.round(progress)}%
              </Badge>
            </div>

            <Progress value={progress} className="h-1.5 rounded-full" />
          </CardContent>
        </Card>

        <div className="grid w-full items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(230px,300px)] 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)] lg:min-h-[clamp(300px,calc(100dvh-310px),460px)]">
            <CardContent className="flex h-full w-full flex-col p-4 sm:p-5">
              <div className="flex min-h-full flex-1 flex-col">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm sm:h-11 sm:w-11">
                    {currentQ + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="max-w-5xl text-lg font-bold leading-snug text-foreground sm:text-xl lg:text-2xl">
                      {fiesQuestions[currentQ]}
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">
                      Pilih jawaban yang paling sesuai dengan kondisi Anda.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:mt-5">
                  <button
                    onClick={() => handleAnswer("ya")}
                    aria-label="Jawab ya untuk pertanyaan"
                    className={`group rounded-[18px] border-2 p-3.5 text-left transition-all sm:p-4 ${
                      answers[currentQ] === "ya"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-sm font-bold sm:text-base">
                          Ya
                        </span>
                        <span className="mt-1 block text-xs leading-5">
                          Saya mengalami kondisi tersebut.
                        </span>
                      </div>

                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-all sm:h-9 sm:w-9 ${
                          answers[currentQ] === "ya"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/40 text-muted-foreground group-hover:border-primary/40"
                        }`}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnswer("tidak")}
                    aria-label="Jawab tidak untuk pertanyaan"
                    className={`group rounded-[18px] border-2 p-3.5 text-left transition-all sm:p-4 ${
                      answers[currentQ] === "tidak"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-sm font-bold sm:text-base">
                          Tidak
                        </span>
                        <span className="mt-1 block text-xs leading-5">
                          Saya tidak mengalami kondisi tersebut.
                        </span>
                      </div>

                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-all sm:h-9 sm:w-9 ${
                          answers[currentQ] === "tidak"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/40 text-muted-foreground group-hover:border-primary/40"
                        }`}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                </div>

                <div className="mt-4 flex flex-col-reverse gap-2.5 border-t border-border/70 pt-3.5 sm:flex-row sm:items-center sm:justify-between lg:mt-auto">
                  <Button
                    variant="ghost"
                    disabled={currentQ === 0}
                    onClick={() => setCurrentQ(currentQ - 1)}
                    className="h-9 justify-center gap-2 rounded-xl text-xs sm:justify-start sm:text-sm"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>

                  <Button
                    onClick={handleNext}
                    disabled={submitting}
                    className="h-9 justify-center gap-2 rounded-xl px-4 text-xs sm:px-5 sm:text-sm"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {submitting
                      ? "Mengirim..."
                      : currentQ === fiesQuestions.length - 1
                        ? "Selesai"
                        : "Selanjutnya"}
                    {!submitting && <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex rounded-[18px] border-border/70 shadow-[0_6px_18px_rgba(15,23,42,0.045)] lg:min-h-[clamp(220px,calc(100dvh-310px),460px)]">
            <CardContent className="flex h-full w-full flex-col p-4">
              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <ClipboardList className="h-[18px] w-[18px] text-primary" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground sm:text-base">
                      Progress Survei
                    </h3>
                    <p className="text-[11px] text-muted-foreground sm:text-xs">
                      {answers.filter(Boolean).length} dari{" "}
                      {fiesQuestions.length} terjawab
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-4">
                  {answers.map((answer, index) => (
                    <div
                      key={index}
                      className={`flex h-8 items-center justify-center rounded-lg border text-xs font-semibold ${
                        index === currentQ
                          ? "border-primary bg-primary text-primary-foreground"
                          : answer
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-border bg-secondary/30 text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-[18px] bg-secondary/40 p-3.5 lg:mt-auto">
                <p className="text-xs font-semibold text-foreground">
                  Catatan
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Jawaban Anda digunakan untuk membantu menentukan prioritas
                  bantuan pangan.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SurveiFIES;