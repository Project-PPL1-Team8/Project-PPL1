import { useState, memo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Wallet,
  Users,
  Store,
  Shield,
  LayoutDashboard,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  TrendingUp,
  Package,
  ClipboardList,
  Activity,
  CreditCard,
  Sparkles,
  ShoppingCart,
  Receipt,
  QrCode,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

type NavItem = { label: string; href: string; icon: React.ElementType };

const navByRole: Record<string, NavItem[]> = {
  donor: [
    { label: "Ringkasan", href: "/dashboard/donor", icon: LayoutDashboard },
    { label: "Langganan", href: "/dashboard/langganan", icon: CreditCard },
    { label: "Riwayat Donasi", href: "/dashboard/riwayat", icon: History },
    { label: "Dampak", href: "/dashboard/dampak", icon: TrendingUp },
    { label: "Profil", href: "/dashboard/profile", icon: Settings },
  ],
  beneficiary: [
    { label: "Ringkasan", href: "/dashboard/beneficiary", icon: LayoutDashboard },
    { label: "Katalog Pangan", href: "/dashboard/katalog", icon: Package },
    { label: "Keranjang", href: "/dashboard/cart", icon: ShoppingCart },
    { label: "Riwayat Pesanan", href: "/dashboard/orders", icon: Receipt },
    { label: "Dompet Nutrisi", href: "/dashboard/dompet-nutrisi", icon: Wallet },
    { label: "Survei FIES", href: "/dashboard/survei-fies", icon: ClipboardList },
    { label: "Pemantauan Gizi", href: "/dashboard/pemantauan-gizi", icon: Activity },
    { label: "Rekomendasi AI", href: "/dashboard/rekomendasi-ai", icon: Sparkles },
    { label: "Profil", href: "/dashboard/profile", icon: Settings },
  ],
  vendor: [
    { label: "Ringkasan", href: "/dashboard/vendor", icon: LayoutDashboard },
    { label: "Kelola Produk", href: "/dashboard/kelola-produk", icon: Package },
    { label: "Scan Voucher", href: "/dashboard/penukaran-voucher", icon: QrCode },
    { label: "Settlement", href: "/dashboard/settlement", icon: CreditCard },
    { label: "Profil", href: "/dashboard/profile", icon: Settings },
  ],
  admin: [
    { label: "Dashboard Admin", href: "/dashboard/admin", icon: LayoutDashboard },
    { label: "Kelola Pengguna", href: "/dashboard/admin/users", icon: Users },
    { label: "Kelola Produk", href: "/dashboard/admin/products", icon: Package },
    { label: "Kelayakan Penerima", href: "/dashboard/admin/beneficiaries", icon: ClipboardList },
    { label: "Kelola Donasi", href: "/dashboard/admin/donations", icon: Heart },
    { label: "Kelola Pesanan", href: "/dashboard/admin/orders", icon: ShoppingCart },
    { label: "Kelola Voucher", href: "/dashboard/admin/vouchers", icon: Wallet },
    { label: "Laporan & Ekspor", href: "/dashboard/admin/reports", icon: TrendingUp },
    { label: "Profil", href: "/dashboard/profile", icon: Settings },
  ],
};

const roleLabel: Record<string, string> = {
  donor: "Donatur",
  beneficiary: "Penerima",
  vendor: "Vendor",
  admin: "Admin",
};

const roleColor: Record<string, string> = {
  donor: "bg-green-600",
  beneficiary: "bg-blue-600",
  vendor: "bg-purple-600",
  admin: "bg-red-600",
};

const RoleIconMap: Record<string, React.ElementType> = {
  donor: Heart,
  beneficiary: Wallet,
  vendor: Store,
  admin: Shield,
};

function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = userRole || "donor";
  const navItems = navByRole[role] || navByRole.donor;
  const displayName = user?.email?.split("@")[0] || "Pengguna";
  const IconComponent = RoleIconMap[role] || Shield;
  const colorClass = roleColor[role] || "bg-gray-600";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", colorClass)}>
              <IconComponent className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-foreground">SeribuAsa</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                signOut();
                navigate("/");
              }}
              className="h-8 w-8"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg", colorClass)}
                >
                  <IconComponent className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-foreground">SeribuAsa</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 text-muted-foreground"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel[role]}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="h-8 w-8"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <button
            className="lg:hidden p-2 text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", colorClass)}>
              <IconComponent className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground text-sm">SeribuAsa</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              {displayName}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => {
                signOut();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default memo(DashboardLayout);
