import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createDonation, getPaymentLink } from "@/services/donations";
import { loadMidtransScript } from "@/utils/midtrans";
import { formatIDR } from "@/lib/format";
import {
  PLAN_NAMES,
  PAYMENT_LABELS,
  PAYMENT_METHOD_MAP,
  DONATION_CHECKOUT_STORAGE_KEY,
} from "@/lib/donation-constants";
import { DonationHero } from "@/components/donation/DonationHero";

export default function CreateDonation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);

  const [planName, setPlanName] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [donationType, setDonationType] = useState<"one_time" | "subscription">("one_time");
  const [paymentMethod, setPaymentMethod] = useState("qris");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  useEffect(() => {
    const checkoutData = sessionStorage.getItem(DONATION_CHECKOUT_STORAGE_KEY);
    if (checkoutData) {
      try {
        const data = JSON.parse(checkoutData);
        if (data.plan) {
          setPlanName(PLAN_NAMES[data.plan] || "Donasi Custom");
          setPlanId(data.plan);
        }
        if (data.amount) {
          setAmount(data.amount.toString());
        }
        if (data.type === "monthly") setDonationType("subscription");
        else if (data.type === "once") setDonationType("one_time");
        if (data.payment) {
          setPaymentMethod(PAYMENT_METHOD_MAP[data.payment] || "qris");
        }
        if (data.name) setDonorName(data.name);
        if (data.email) setDonorEmail(data.email);
        sessionStorage.removeItem(DONATION_CHECKOUT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }

    const planAmount = searchParams.get("amount");
    const planType = searchParams.get("type");
    const planPayment = searchParams.get("payment");
    const planId = searchParams.get("plan");

    if (planAmount && !amount) setAmount(planAmount);
    if (planType === "monthly" && donationType !== "subscription") setDonationType("subscription");
    if (planType === "once" && donationType !== "one_time") setDonationType("one_time");
    if (planPayment) {
      setPaymentMethod(PAYMENT_METHOD_MAP[planPayment] || "qris");
    }
    if (planId && !planName) {
      setPlanName(PLAN_NAMES[planId] || "Donasi Custom");
      setPlanId(planId);
    }
  }, [searchParams, amount, donationType, planName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseInt(amount) < 10000) {
      toast.error("Jumlah minimal Rp 10.000");
      return;
    }
    setLoading(true);
    try {
      // Step 1: Buat donasi (tanpa recipient_id — sistem auto-assign)
      const donation = await createDonation({
        amount: parseInt(amount),
        type: donationType,
        payment_method: paymentMethod,
        plan_id: planId, // Kirim plan ID ke backend
        is_subscription: donationType === "subscription", // Flag untuk subscription
      });

      // Step 2: Dapatkan Payment Link dari backend untuk Midtrans
      toast.loading("Mendapatkan tautan pembayaran...", { id: "payment" });
      const paymentData: any = await getPaymentLink(donation.id);
      
      const snapToken = paymentData?.snap_token;
      
      if (!snapToken) {
        toast.dismiss("payment");
        toast.error("Gagal mendapatkan Token Midtrans. Pastikan konfigurasi Midtrans sudah benar.");
        setLoading(false);
        return;
      }
      
      const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || "SB-Mid-client-XXXXX";
      const isLoaded = await loadMidtransScript(clientKey);
      toast.dismiss("payment");
      
      if (!isLoaded) {
        toast.error("Gagal memuat layanan Midtrans.");
        setLoading(false);
        return;
      }
      
      // @ts-ignore
      window.snap.pay(snapToken, {
        onSuccess: function (result: any) {
          toast.success("Pembayaran berhasil diselesaikan! 🎉", { id: "paid" });
          navigate("/donation/success", {
            state: {
              donationId: donation.id,
              amount: parseInt(amount),
              // Prefer midtrans transaction id
              transactionId: result.transaction_id || result.order_id,
              voucherCreated: true, // Auto generated when webhook resolves
              impact: {
                children_helped: Math.floor(parseInt(amount) / 500000) || 1,
                days_of_support: (Math.floor(parseInt(amount) / 500000) || 1) * 1000
              }
            },
          });
        },
        onPending: function (result: any) {
          toast.info("Pembayaran tertunda. Harap selesaikan pembayaran Anda.", { id: "pending" });
          navigate("/dashboard");
        },
        onError: function (result: any) {
          toast.error("Pembayaran gagal diproses!", { id: "error" });
          setLoading(false);
        },
        onClose: function () {
          toast.info("Anda menutup pop-up pembayaran sebelum menyelesaikannya.", { id: "close" });
          setLoading(false);
        }
      });
    } catch (err) {
      toast.dismiss("payment");
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal memproses donasi", { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-6">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <DonationHero
            icon={Heart}
            title="Konfirmasi Donasi"
            subtitle="Periksa detail sebelum pembayaran."
            color="green"
            iconSize="small"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Plan Info - Compact */}
            {planName && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-2">
                <p className="text-xs font-semibold text-green-800">{planName}</p>
                <p className="text-xs text-green-600">
                  {donationType === "subscription" ? "Donasi Bulanan" : "Sekali"}
                </p>
              </div>
            )}

            {/* Details Grid - Compact */}
            <div className="space-y-1.5 text-xs bg-gray-50 p-3 rounded-lg">
              {donorName && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Donatur:</span>
                  <span className="font-medium text-gray-900">{donorName}</span>
                </div>
              )}
              {donorEmail && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-900 truncate ml-2">{donorEmail}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-gray-200">
                <span className="text-gray-600">Jenis:</span>
                <span className="font-medium text-gray-900">
                  {donationType === "one_time" ? "Sekali" : "Bulanan"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Metode:</span>
                <span className="font-medium text-gray-900">
                  {PAYMENT_LABELS[paymentMethod] || paymentMethod}
                </span>
              </div>
            </div>

            {/* Amount & CTA */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-600 mb-1">Total Donasi</p>
              <p className="text-2xl font-bold text-green-700">
                {formatIDR(parseInt(amount) || 0)}
              </p>
              {parseInt(amount) >= 500000 && (
                <p className="text-xs text-green-600 mt-1">
                  = {Math.floor(parseInt(amount) / 500000)} anak +{" "}
                  {Math.floor(parseInt(amount) / 500000) * 1000} hari dukungan
                </p>
              )}
            </div>

            {/* CTA Button */}
            <Button
              type="submit"
              disabled={loading || !amount}
              className="w-full h-10 text-sm bg-green-600 hover:bg-green-700"
              size="sm"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  Bayar Sekarang
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-xs text-center text-gray-500">
              Anda akan diarahkan ke halaman pembayaran yang aman.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
