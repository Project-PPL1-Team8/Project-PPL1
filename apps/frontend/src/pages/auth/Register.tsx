import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Heart, Users, Store } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.25-.95 2.31-2.02 3.01l3.27 2.53c1.9-1.75 3-4.33 3-7.43 0-.7-.06-1.37-.18-2.01H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.45l-3.27-2.53c-.9.61-2.05.97-3.34.97-2.57 0-4.76-1.74-5.54-4.08l-3.37 2.6A9.99 9.99 0 0 0 12 22z"
      />
      <path
        fill="#4A90E2"
        d="M6.46 13.91A5.99 5.99 0 0 1 6.15 12c0-.66.11-1.29.31-1.91l-3.37-2.6A9.99 9.99 0 0 0 2 12c0 1.61.38 3.13 1.09 4.51l3.37-2.6z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.01c1.47 0 2.79.5 3.83 1.49l2.87-2.87C16.95 2.99 14.7 2 12 2a9.99 9.99 0 0 0-8.91 5.49l3.37 2.6c.78-2.34 2.97-4.08 5.54-4.08z"
      />
    </svg>
  );
}

type Role = "donor" | "beneficiary" | "vendor";

const roles: { id: Role; label: string; icon: React.ElementType; desc: string; info: string }[] = [
  {
    id: "donor",
    label: "Donatur",
    icon: Heart,
    desc: "Bantu nutrisi",
    info: "Penyumbang Dana & Dukungan. Individu, korporasi, atau lembaga yang menyumbangkan dana untuk program nutrisi. Donasi Anda dikelola transparan melalui sistem e-voucher yang tepat sasaran untuk keluarga rentan.",
  },
  {
    id: "beneficiary",
    label: "Penerima",
    icon: Users,
    desc: "Terima dukungan",
    info: "Keluarga Rentan & Anak Usia Dini. Keluarga dengan anak usia 1000 hari pertama yang membutuhkan dukungan nutrisi. Prioritas bantuan ditentukan berdasarkan skor FIES (Food Insecurity Experience Scale) untuk memastikan yang paling rentan mendapat bantuan terlebih dahulu.",
  },
  {
    id: "vendor",
    label: "Vendor",
    icon: Store,
    desc: "Jual pangan",
    info: "Penyedia Bahan Pangan Bergizi. Toko kelontong, tukang sayur, atau UMKM pangan terverifikasi yang menerima e-voucher sebagai alat pembayaran. Vendor menjual bahan pangan bergizi sesuai katalog yang telah disetujui sistem.",
  },
];

const passwordRequirements = [
  { regex: /.{8,}/, label: "Minimal 8 karakter" },
  { regex: /[A-Z]/, label: "1 huruf besar" },
  { regex: /[0-9]/, label: "1 angka" },
  { regex: /[@$!%*?&]/, label: "1 simbol (@$!%*?&)" },
];

function isPasswordValid(password: string): boolean {
  return passwordRequirements.every((req) => req.regex.test(password));
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, signInWithGoogle } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [infoOpen, setInfoOpen] = useState<Role | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  // Read role from URL query parameter on mount
  useEffect(() => {
    const roleFromUrl = searchParams.get("role") as Role;
    if (roleFromUrl && roles.some((r) => r.id === roleFromUrl)) {
      setRole(roleFromUrl);
    }
  }, [searchParams]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordValid = password.length > 0 && isPasswordValid(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      toast.error("Pilih peran Anda terlebih dahulu");
      return;
    }

    if (!fullName.trim()) {
      toast.error("Nama lengkap tidak boleh kosong");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email tidak valid");
      return;
    }

    if (phone.trim()) {
      const phoneRegex = /^[0-9+\-\s]{8,20}$/;
      if (!phoneRegex.test(phone.trim())) {
        toast.error("Nomor HP tidak valid");
        return;
      }
    }

    if (!passwordValid) {
      toast.error("Password tidak memenuhi syarat");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Password tidak cocok");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp(email, password, fullName, role, {
        phone,
        address,
      });

      if (error) {
        const errorMsg = error.toLowerCase();
        if (errorMsg.includes("email") || errorMsg.includes("already")) {
          toast.error("Email sudah terdaftar", {
            description: "Gunakan email lain atau coba login",
          });
        } else if (errorMsg.includes("password")) {
          toast.error("Password error", { description: error });
        } else {
          toast.error("Registrasi gagal", { description: error });
        }
        return;
      }

      toast.success("Registrasi berhasil!");
      navigate("/dashboard");
    } catch (err) {
      const error = err as Error;
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes("email") || errorMsg.includes("already")) {
        toast.error("Email sudah terdaftar", { description: "Gunakan email lain atau coba login" });
      } else if (errorMsg.includes("password")) {
        toast.error("Password error", { description: error.message });
      } else {
        toast.error("Registrasi gagal", { description: error.message || "Coba lagi nanti" });
      }
      console.error("Registration error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (!role) {
      toast.error("Pilih peran terlebih dahulu", {
        description: "Role akan dipakai untuk akun Google baru Anda.",
      });
      return;
    }

    setGoogleLoading(true);
    const { error } = await signInWithGoogle(role);

    if (error) {
      toast.error("Registrasi Google gagal", { description: error });
      setGoogleLoading(false);
      return;
    }

    toast.info("Mengalihkan ke Google...");
  };

  return (
    <div
      className="flex h-screen items-center justify-center px-4 overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)",
      }}
    >
      {/* Background Decor */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.1)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "rgba(37,99,235,0.07)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="w-full max-w-md bg-white p-6 sm:p-8 relative z-10 overflow-y-auto max-h-[92vh] hide-scrollbar"
        style={{
          borderRadius: "28px",
          boxShadow: "0 24px 48px -12px rgba(22,163,74,0.15), 0 0 24px 0 rgba(0,0,0,0.04)",
          border: "1px solid rgba(22,163,74,0.1)",
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          className="block mb-6 transition-transform hover:scale-105"
          style={{ textDecoration: "none" }}
        >
          <div className="flex flex-col items-center">
            <img
              src={logo}
              alt="SeribuAsa Logo"
              style={{
                width: 90,
                height: 90,
                objectFit: "contain",
                marginBottom: -15,
                filter: "drop-shadow(0 4px 8px rgba(22,163,74,0.2))",
              }}
            />
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                color: "#346A43",
                letterSpacing: "-0.5px",
              }}
            >
              SeribuAsa
            </h1>
          </div>
        </Link>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {/* Role Selection */}
          <div>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#333",
                display: "block",
                marginBottom: "8px",
              }}
            >
              Anda adalah
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              {roles.map((r) => {
                const Icon = r.icon;
                const isSelected = role === r.id;
                return (
                  <div key={r.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setRole(r.id)}
                      style={{
                        padding: "8px 4px",
                        borderRadius: "12px",
                        border: isSelected ? "2px solid #16a34a" : "1.5px solid #eee",
                        background: isSelected ? "#f0fdf4" : "#fff",
                        transition: "all 0.2s ease",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: "100%",
                        position: "relative",
                      }}
                    >
                      <div style={{ marginBottom: "4px" }}>
                        <Icon size={18} style={{ color: isSelected ? "#16a34a" : "#999" }} />
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          padding: "2px 6px",
                          fontSize: "10px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.16em",
                          color: "#6b7280",
                        }}
                        onMouseEnter={(e) => {
                          setInfoOpen(r.id);
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopupPosition({
                            x: rect.left - 144 + rect.width / 2,
                            y: rect.top - 10,
                          });
                        }}
                        onMouseLeave={() => setInfoOpen(null)}
                      >
                        i
                      </div>
                      <p style={{ fontSize: "11px", fontWeight: 700, color: "#111", margin: 0 }}>
                        {r.label}
                      </p>
                      <p style={{ fontSize: "9px", color: "#666", margin: 0 }}>{r.desc}</p>
                    </button>

                    {infoOpen === r.id && (
                      <div
                        style={{
                          position: "fixed",
                          left: `${popupPosition.x}px`,
                          top: `${popupPosition.y}px`,
                          width: "288px",
                          borderRadius: "26px",
                          border: "1px solid #dcfce7",
                          background: "#fff",
                          padding: "16px",
                          boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
                          zIndex: 10000,
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            marginBottom: "12px",
                            borderBottom: "1px solid #dcfce7",
                            paddingBottom: "12px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "#0f172a",
                              margin: 0,
                            }}
                          >
                            {r.label}
                          </p>
                          <p
                            style={{
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.18em",
                              color: "#16a34a",
                              margin: 0,
                            }}
                          >
                            {r.desc}
                          </p>
                        </div>
                        <div
                          style={{
                            borderRadius: "16px",
                            background: "rgba(220, 252, 231, 0.9)",
                            padding: "12px",
                            fontSize: "13px",
                            lineHeight: "1.5",
                            color: "#334155",
                          }}
                        >
                          {r.info}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Full Name */}
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#333",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Nama Lengkap
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1.5px solid #eee",
                  fontSize: "13px",
                  outline: "none",
                  background: "#fafafa",
                  boxSizing: "border-box",
                }}
                placeholder="Masukkan nama"
                disabled={loading}
              />
            </div>
            {/* Phone */}
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#333",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Nomor HP (opsional)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1.5px solid #eee",
                  fontSize: "13px",
                  outline: "none",
                  background: "#fafafa",
                  boxSizing: "border-box",
                }}
                placeholder="08xxxxxxxxxx"
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#333",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1.5px solid #eee",
                fontSize: "13px",
                outline: "none",
                background: "#fafafa",
                boxSizing: "border-box",
              }}
              placeholder="nama@email.com"
              disabled={loading}
            />
          </div>

          {/* Address */}
          <div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#333",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Alamat (opsional)
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1.5px solid #eee",
                fontSize: "13px",
                outline: "none",
                background: "#fafafa",
                boxSizing: "border-box",
                minHeight: "60px",
                resize: "none",
              }}
              placeholder="Masukkan alamat"
              disabled={loading}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Password */}
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#333",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 32px 10px 12px",
                    borderRadius: "12px",
                    border: "1.5px solid #eee",
                    fontSize: "13px",
                    outline: "none",
                    background: "#fafafa",
                    boxSizing: "border-box",
                  }}
                  placeholder="Buat password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#999",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {/* Confirm Password */}
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#333",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Konfirmasi Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 32px 10px 12px",
                    borderRadius: "12px",
                    border: "1.5px solid #eee",
                    fontSize: "13px",
                    outline: "none",
                    background: "#fafafa",
                    boxSizing: "border-box",
                  }}
                  placeholder="Ulangi password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#999",
                    cursor: "pointer",
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: "44px",
              background: "linear-gradient(135deg, #16a34a, #15803d)",
              color: "#fff",
              borderRadius: "14px",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              marginTop: "8px",
            }}
          >
            {loading ? "Mendaftar..." : "Daftar"}
          </Button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1, height: "1px", background: "#eee" }} />
            <span
              style={{
                fontSize: "10px",
                color: "#999",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              atau
            </span>
            <div style={{ flex: 1, height: "1px", background: "#eee" }} />
          </div>

          <button
            type="button"
            onClick={handleGoogleRegister}
            disabled={loading || googleLoading || !role}
            style={{
              width: "100%",
              height: "42px",
              borderRadius: "14px",
              border: "1.5px solid #eee",
              background: "#fff",
              color: "#111",
              fontSize: "13px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            {googleLoading ? (
              "Mengalihkan..."
            ) : (
              <>
                <GoogleIcon /> Daftar dengan Google
              </>
            )}
          </button>

          {!role && (
            <p style={{ fontSize: "10px", color: "#ef4444", textAlign: "center", margin: 0 }}>
              Pilih role di atas sebelum daftar dengan Google
            </p>
          )}

          {/* Sign In Link */}
          <p style={{ textAlign: "center", fontSize: "13px", color: "#666", margin: "4px 0 0 0" }}>
            Sudah punya akun?{" "}
            <Link to="/login" style={{ color: "#16a34a", fontWeight: 700, textDecoration: "none" }}>
              Masuk di sini
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
