import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Index from "./pages/Index";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Donasi from "./pages/Donasi";
import Tentang from "./pages/Tentang";
import Dampak from "./pages/Dampak";
import Privasi from "./pages/Privasi";
import Syarat from "./pages/Syarat";
import Kontak from "./pages/Kontak";
import LupaSandi from "./pages/auth/LupaSandi";
import ResetPassword from "./pages/auth/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import DonorDashboard from "./pages/dashboard/DonorDashboard";
import BeneficiaryDashboard from "./pages/dashboard/BeneficiaryDashboard";
import DonorRiwayat from "./pages/dashboard/DonorRiwayat";
import Profile from "./pages/dashboard/Profile";
import VendorDashboard from "./pages/dashboard/VendorDashboard";
import AdminDashboard from "./pages/dashboard/AdminDashboard";
import AdminUsersPage from "./pages/dashboard/admin/AdminUsersPage";
import AdminProductsPage from "./pages/dashboard/admin/AdminProductsPage";
import AdminBeneficiariesPage from "./pages/dashboard/admin/AdminBeneficiariesPage";
import AdminDonationsPage from "./pages/dashboard/admin/AdminDonationsPage";
import AdminOrdersPage from "./pages/dashboard/admin/AdminOrdersPage";
import AdminVouchersPage from "./pages/dashboard/admin/AdminVouchersPage";
import AdminReportsPage from "./pages/dashboard/admin/AdminReportsPage";
import DonationCheckout from "./pages/donation/DonationCheckout";
import CreateDonation from "./pages/donation/CreateDonation";
import DonationSuccess from "./pages/donation/DonationSuccess";
import { useAuth } from "./contexts/AuthContext";
import ScrollToTop from "./components/ScrollToTop";

// Heavy pages → lazy-loaded
const DonorDampak = lazy(() => import("./pages/dashboard/DonorDampak"));
const PemantauanGizi = lazy(() => import("./pages/dashboard/PemantauanGizi"));
const KatalogPangan = lazy(() => import("./pages/dashboard/KatalogPangan"));
const DonorLangganan = lazy(() => import("./pages/dashboard/DonorLangganan"));
const KelolaProduk = lazy(() => import("./pages/dashboard/KelolaProduk"));
const VendorSettlement = lazy(() => import("./pages/dashboard/VendorSettlement"));
const SurveiFIES = lazy(() => import("./pages/dashboard/SurveiFIES"));
const PenukaranVoucher = lazy(() => import("./pages/dashboard/PenukaranVoucher"));
const DompetNutrisi = lazy(() => import("./pages/dashboard/DompetNutrisi"));
const RekomendasiAI = lazy(() => import("./pages/dashboard/RekomendasiAI"));
const CartManagement = lazy(() => import("./pages/dashboard/cart/CartManagement"));
const VoucherWallet = lazy(() => import("./pages/dashboard/vouchers/VoucherWallet"));
const OrderHistoryPage = lazy(() => import("./pages/dashboard/orders/OrderHistoryPage"));
const OrderDetailPage = lazy(() => import("./pages/dashboard/orders/OrderDetailPage"));
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const CheckoutSuccess = lazy(() => import("./pages/checkout/CheckoutSuccess"));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
    </div>
  );
}

function DashboardRedirect() {
  const { userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
      </div>
    );
  }

  if (userRole === "donor") return <Navigate to="/dashboard/donor" replace />;
  if (userRole === "beneficiary") return <Navigate to="/dashboard/beneficiary" replace />;
  if (userRole === "vendor") return <Navigate to="/dashboard/vendor" replace />;
  if (userRole === "admin") return <Navigate to="/dashboard/admin" replace />;

  return <Navigate to="/" replace />;
}

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <ScrollToTop />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/donasi" element={<Donasi />} />
        <Route path="/tentang" element={<Tentang />} />
        <Route path="/dampak" element={<Dampak />} />
        <Route path="/lupa-sandi" element={<LupaSandi />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privasi" element={<Privasi />} />
        <Route path="/syarat" element={<Syarat />} />
        <Route path="/kontak" element={<Kontak />} />

        {/* Authenticated routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/donor"
          element={
            <ProtectedRoute allowedRoles={["donor", "admin"]}>
              <DonorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/beneficiary"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <BeneficiaryDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/riwayat"
          element={
            <ProtectedRoute allowedRoles={["donor", "admin"]}>
              <DonorRiwayat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/dampak"
          element={
            <ProtectedRoute allowedRoles={["donor", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <DonorDampak />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/langganan"
          element={
            <ProtectedRoute allowedRoles={["donor", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <DonorLangganan />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/katalog"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <KatalogPangan />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/survei-fies"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <SurveiFIES />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/pemantauan-gizi"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <PemantauanGizi />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/dompet-nutrisi"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <DompetNutrisi />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/rekomendasi-ai"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <RekomendasiAI />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/penukaran-voucher"
          element={
            <ProtectedRoute allowedRoles={["vendor", "admin", "beneficiary"]}>
              <Suspense fallback={<PageLoader />}>
                <PenukaranVoucher />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/kelola-produk"
          element={
            <ProtectedRoute allowedRoles={["vendor", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <KelolaProduk />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settlement"
          element={
            <ProtectedRoute allowedRoles={["vendor", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <VendorSettlement />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/vendor"
          element={
            <ProtectedRoute allowedRoles={["vendor", "admin"]}>
              <VendorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/users"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/products"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/beneficiaries"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminBeneficiariesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/donations"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDonationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/orders"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/vouchers"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminVouchersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin/reports"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* New Cart & Voucher Dashboard Routes */}
        <Route
          path="/dashboard/cart"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <CartManagement />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/vouchers"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <VoucherWallet />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/orders"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <OrderHistoryPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/orders/:orderId"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <OrderDetailPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Checkout Routes */}
        <Route
          path="/checkout"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <CheckoutPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout/success/:orderId"
          element={
            <ProtectedRoute allowedRoles={["beneficiary", "admin"]}>
              <Suspense fallback={<PageLoader />}>
                <CheckoutSuccess />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Donation flow routes */}
        <Route path="/donation/checkout" element={<DonationCheckout />} />
        <Route
          path="/donation/create"
          element={
            <ProtectedRoute allowedRoles={["donor", "admin", "beneficiary", "vendor"]}>
              <CreateDonation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/donation/success"
          element={
            <ProtectedRoute>
              <DonationSuccess />
            </ProtectedRoute>
          }
        />

        {/* Redirect legacy /dashboard/vouchers → /dashboard/dompet-nutrisi */}
        <Route
          path="/dashboard/vouchers"
          element={<Navigate to="/dashboard/dompet-nutrisi" replace />}
        />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
