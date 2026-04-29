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
  if (s <= 2)
    return {
      label: "Ketahanan Pangan Baik",
      color: "bg-primary/10 text-primary border-primary/20",
      desc: "Ketahanan pangan Anda dalam kondisi baik.",
    };
  if (s <= 5)
    return {
      label: "Ketahanan Pangan Sedang",
      color: "bg-accent/10 text-accent-foreground border-accent/20",
      desc: "Ada indikasi kerawanan pangan sedang. Anda akan mendapat prioritas bantuan.",
    };
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
      toast.error("Pilih jawaban", { description: "Silakan pilih Ya atau Tidak" });
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
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim survei");
    } finally {
      setSubmitting(false);
    }
  };

  // — Completed —
  if (completed) {
    const severity = getSeverity(score);

    return (
      <DashboardLayout title="Survei FIES" subtitle="Survei ketahanan pangan bulanan.">
        <div className="w-full max-w-none pb-4">
          <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-0">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
                <div className="relative overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 p-5 text-primary-foreground sm:p-7 lg:p-8">
                  <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/10 sm:h-64 sm:w-64" />
                  <div className="absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-black/10 sm:h-72 sm:w-72" />

                  <div className="relative flex min-h-[260px] flex-col justify-between gap-6 sm:min-h-[300px]">
                    <div className="space-y-5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg sm:h-14 sm:w-14">
                        <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7" />
                      </div>

                      <div className="space-y-2">
                        <h2 className="text-[clamp(1.5rem,1.15rem+1vw,2.25rem)] font-bold tracking-tight">
                          Survei Selesai!
                        </h2>
                        <p className="max-w-md text-[clamp(0.82rem,0.78rem+0.2vw,0.95rem)] leading-6 text-white/85">
                          Terima kasih telah mengisi survei ketahanan pangan bulan ini.
                        </p>
                      </div>
                    </div>

                    <Button
                      className="h-11 w-full rounded-xl bg-white px-5 text-primary hover:bg-white/90 sm:w-fit"
                      onClick={() => navigate("/dashboard/beneficiary")}
                    >
                      Kembali ke Dashboard
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-5 sm:p-6 lg:p-7">
                  <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4 sm:p-5">
                    <p className="text-[clamp(0.78rem,0.72rem+0.2vw,0.9rem)] text-muted-foreground">
                      Skor FIES Anda
                    </p>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="text-[clamp(2.25rem,1.8rem+1.4vw,3.5rem)] font-bold tracking-tight text-foreground">
                        {score}
                        <span className="text-[clamp(1.25rem,1rem+0.7vw,1.75rem)] text-muted-foreground">
                          {" "}
                          / 8
                        </span>
                      </div>

                      <Badge className={`w-fit rounded-full px-3 py-1 text-xs ${severity.color}`}>
                        {severity.label}
                      </Badge>
                    </div>

                    <p className="mt-4 text-[clamp(0.78rem,0.72rem+0.2vw,0.9rem)] leading-6 text-muted-foreground">
                      {severity.desc}
                    </p>
                  </div>

                  {score > 5 && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
                      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          Bantuan Diprioritaskan
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Berdasarkan skor FIES Anda, alokasi voucher nutrisi akan diprioritaskan
                          untuk keluarga Anda.
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
      <DashboardLayout title="Survei FIES" subtitle="Survei ketahanan pangan bulanan.">
        <div className="w-full max-w-none space-y-4 pb-4">
          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
            <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
              <CardContent className="relative min-h-[280px] bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 p-5 text-primary-foreground sm:min-h-[320px] sm:p-7 lg:p-8">
                <div className="absolute right-6 top-6 grid grid-cols-6 gap-2 opacity-25">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <span key={i} className="h-1 w-1 rounded-full bg-white" />
                  ))}
                </div>

                <div className="absolute -right-20 bottom-8 h-64 w-64 rounded-full bg-white/10 sm:h-80 sm:w-80" />
                <div className="absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-black/10 sm:h-72 sm:w-72" />

                <div className="relative z-10 flex h-full min-h-[240px] flex-col justify-between gap-8 sm:min-h-[260px]">
                  <div className="space-y-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg shadow-black/10 sm:h-14 sm:w-14">
                      <ClipboardList className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>

                    <div className="max-w-2xl space-y-3">
                      <h2 className="max-w-xl text-[clamp(1.45rem,1.1rem+1.2vw,2.5rem)] font-bold leading-tight tracking-tight">
                        Survei Ketahanan Pangan (FIES)
                      </h2>
                      <p className="max-w-xl text-[clamp(0.82rem,0.76rem+0.25vw,1rem)] leading-6 text-white/85">
                        Survei bulanan untuk mengukur tingkat ketahanan pangan keluarga Anda.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setStarted(true)}
                    className="h-11 w-full rounded-xl bg-white px-5 text-sm font-semibold text-primary shadow-lg shadow-black/10 hover:bg-white/90 sm:w-fit sm:px-6"
                  >
                    Mulai Survei
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Info className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-[clamp(1rem,0.9rem+0.3vw,1.18rem)] font-bold text-foreground">
                    Tentang survei ini
                  </h3>
                </div>

                <div className="divide-y divide-border/70">
                  {surveyInfo.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.title}
                        className="flex gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-[clamp(0.82rem,0.78rem+0.15vw,0.92rem)] font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-[clamp(0.72rem,0.68rem+0.14vw,0.8rem)] leading-5 text-muted-foreground">
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

          <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <History className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-[clamp(1rem,0.9rem+0.3vw,1.18rem)] font-bold text-foreground">
                  Riwayat Survei
                </h3>
              </div>

              {historyLoading ? (
                <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex animate-pulse items-center justify-between">
                      <div className="h-4 w-32 rounded bg-secondary" />
                      <div className="h-7 w-28 rounded-full bg-secondary" />
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="grid min-h-[130px] place-items-center rounded-2xl border border-border/70 bg-gradient-to-br from-background to-secondary/20 p-4">
                  <div className="flex w-full max-w-2xl flex-col items-center justify-center gap-4 text-center sm:flex-row sm:text-left">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-20 sm:w-20">
                      <ClipboardX className="h-8 w-8 text-primary/40 sm:h-10 sm:w-10" />
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-[clamp(0.95rem,0.88rem+0.25vw,1.1rem)] font-bold text-foreground">
                        Belum ada riwayat survei
                      </h4>
                      <p className="mt-1.5 text-[clamp(0.78rem,0.72rem+0.2vw,0.9rem)] leading-6 text-muted-foreground">
                        Mulai survei pertama Anda untuk membantu kami memahami kondisi ketahanan
                        pangan keluarga Anda.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  {history.map((h: any) => {
                    const severity = getSeverity(h.score);

                    return (
                      <div
                        key={h.id}
                        className="flex flex-col gap-2 border-b border-border/50 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-sm text-muted-foreground">
                          {formatDate(h.survey_date)}
                        </span>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            {h.score}/8
                          </span>
                          <Badge variant="outline" className={`rounded-full ${severity.color}`}>
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
    <DashboardLayout title="Survei FIES" subtitle="Survei ketahanan pangan bulanan.">
      <div className="w-full max-w-none space-y-4 pb-4">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[clamp(0.82rem,0.78rem+0.18vw,0.95rem)] font-bold text-foreground">
                  Pertanyaan {currentQ + 1} dari {fiesQuestions.length}
                </p>
                <p className="mt-1 text-[clamp(0.72rem,0.68rem+0.15vw,0.82rem)] text-muted-foreground">
                  Jawab sesuai kondisi 30 hari terakhir.
                </p>
              </div>

              <Badge
                variant="outline"
                className="w-fit shrink-0 rounded-full px-3 py-1 text-[clamp(0.68rem,0.64rem+0.15vw,0.76rem)] font-semibold"
              >
                {Math.round(progress)}%
              </Badge>
            </div>

            <Progress value={progress} className="h-2 rounded-full" />
          </CardContent>
        </Card>

        <div className="grid w-full items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,330px)] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex rounded-2xl border-border/70 shadow-sm lg:min-h-[clamp(380px,calc(100dvh-340px),560px)]">
            <CardContent className="flex h-full w-full flex-col p-4 sm:p-5 lg:p-6">
              <div className="flex min-h-full flex-1 flex-col">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-[clamp(0.9rem,0.84rem+0.22vw,1.1rem)] font-bold text-primary-foreground shadow-sm sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                    {currentQ + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="max-w-5xl text-[clamp(1.05rem,0.9rem+0.55vw,1.55rem)] font-bold leading-snug text-foreground">
                      {fiesQuestions[currentQ]}
                    </p>
                    <p className="mt-2 text-[clamp(0.78rem,0.72rem+0.2vw,0.9rem)] leading-6 text-muted-foreground">
                      Pilih jawaban yang paling sesuai dengan kondisi Anda.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:mt-7">
                  <button
                    onClick={() => handleAnswer("ya")}
                    aria-label="Jawab ya untuk pertanyaan"
                    className={`group rounded-2xl border-2 p-4 text-left transition-all sm:p-5 ${
                      answers[currentQ] === "ya"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-[clamp(0.95rem,0.9rem+0.22vw,1.1rem)] font-bold">
                          Ya
                        </span>
                        <span className="mt-1 block text-[clamp(0.74rem,0.7rem+0.16vw,0.86rem)] leading-5">
                          Saya mengalami kondisi tersebut.
                        </span>
                      </div>

                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-all sm:h-10 sm:w-10 ${
                          answers[currentQ] === "ya"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/40 text-muted-foreground group-hover:border-primary/40"
                        }`}
                      >
                        <CheckCircle className="h-5 w-5" />
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnswer("tidak")}
                    aria-label="Jawab tidak untuk pertanyaan"
                    className={`group rounded-2xl border-2 p-4 text-left transition-all sm:p-5 ${
                      answers[currentQ] === "tidak"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-[clamp(0.95rem,0.9rem+0.22vw,1.1rem)] font-bold">
                          Tidak
                        </span>
                        <span className="mt-1 block text-[clamp(0.74rem,0.7rem+0.16vw,0.86rem)] leading-5">
                          Saya tidak mengalami kondisi tersebut.
                        </span>
                      </div>

                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-all sm:h-10 sm:w-10 ${
                          answers[currentQ] === "tidak"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/40 text-muted-foreground group-hover:border-primary/40"
                        }`}
                      >
                        <CheckCircle className="h-5 w-5" />
                      </span>
                    </div>
                  </button>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between lg:mt-auto lg:pt-5">
                  <Button
                    variant="ghost"
                    disabled={currentQ === 0}
                    onClick={() => setCurrentQ(currentQ - 1)}
                    className="h-10 justify-center gap-2 rounded-xl text-[clamp(0.78rem,0.74rem+0.15vw,0.9rem)] sm:justify-start"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>

                  <Button
                    onClick={handleNext}
                    disabled={submitting}
                    className="h-10 justify-center gap-2 rounded-xl px-5 text-[clamp(0.78rem,0.74rem+0.15vw,0.9rem)] sm:h-11 sm:px-6"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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

          <Card className="flex rounded-2xl border-border/70 shadow-sm lg:min-h-[clamp(260px,calc(100dvh-340px),560px)]">
            <CardContent className="flex h-full w-full flex-col p-4 sm:p-5">
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-[clamp(0.9rem,0.84rem+0.22vw,1rem)] font-bold text-foreground">
                      Progress Survei
                    </h3>
                    <p className="text-[clamp(0.68rem,0.64rem+0.15vw,0.76rem)] text-muted-foreground">
                      {answers.filter(Boolean).length} dari {fiesQuestions.length} terjawab
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-4">
                  {answers.map((answer, index) => (
                    <div
                      key={index}
                      className={`flex h-9 items-center justify-center rounded-xl border text-[clamp(0.68rem,0.64rem+0.15vw,0.78rem)] font-semibold sm:h-10 ${
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

              <div className="mt-4 rounded-2xl bg-secondary/40 p-4 lg:mt-auto">
                <p className="text-[clamp(0.72rem,0.68rem+0.15vw,0.8rem)] font-semibold text-foreground">
                  Catatan
                </p>
                <p className="mt-1 text-[clamp(0.68rem,0.64rem+0.15vw,0.76rem)] leading-5 text-muted-foreground">
                  Jawaban Anda digunakan untuk membantu menentukan prioritas bantuan pangan.
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