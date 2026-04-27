import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { supabase } from "@/integrations/supabase/client"

type SupabaseUserMetadata = {
  full_name?: string | null
  name?: string | null
  role?: string | null
  phone?: string | null
  address?: string | null
}

type Session = {
  access_token: string
  user: {
    id: string
    email?: string | null
    user_metadata?: SupabaseUserMetadata
    app_metadata?: {
      provider?: string
      providers?: string[]
    }
    identities?: Array<{ provider?: string | null } | null>
  }
}

type UserRole = "donor" | "beneficiary" | "vendor" | "admin" | "government" | "corporate_donor" | null
type GoogleSignInRole = Exclude<UserRole, "admin" | "government" | null>

interface AuthUser {
  id: string
  email: string
  fullName: string
  role: UserRole
}

interface AuthContextType {
  user: AuthUser | null
  userRole: UserRole
  loading: boolean
  session: Session | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: (role?: GoogleSignInRole) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: string,
    profileData?: { phone?: string; address?: string }
  ) => Promise<{ error: string | null }>
  signInAsDemo: (role: UserRole) => void
  signOut: () => Promise<void>
}

const AUTH_KEY = "nutriguard-auth"
const GOOGLE_ROLE_KEY = "nutriguard-google-role"
const BACKEND_BASE_URL = "http://localhost:8000/api/v1"
const KNOWN_ROLES = new Set(["donor", "beneficiary", "vendor", "admin", "government", "corporate_donor"])
const PROFILE_ROLES = new Set(["donor", "beneficiary", "vendor", "corporate_donor"])

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function resolveRoleFromEmail(email?: string | null): UserRole {
  if (!email) return null

  const lowered = email.toLowerCase()
  if (lowered.includes("penerima") || lowered.includes("beneficiary")) return "beneficiary"
  if (lowered.includes("vendor")) return "vendor"
  if (lowered.includes("admin")) return "admin"
  if (lowered.includes("government")) return "government"
  if (lowered.includes("corporate")) return "corporate_donor"
  return "donor"
}

function isKnownRole(value: unknown): value is Exclude<UserRole, null> {
  return typeof value === "string" && KNOWN_ROLES.has(value)
}

function isProfileRole(value: unknown): value is GoogleSignInRole {
  return typeof value === "string" && PROFILE_ROLES.has(value)
}

async function getSessionRoleFallback(): Promise<UserRole> {
  const { data: sessionData } = await supabase.auth.getSession()
  const metadataRole = sessionData?.session?.user?.user_metadata?.role
  if (isKnownRole(metadataRole)) {
    return metadataRole
  }
  return resolveRoleFromEmail(sessionData?.session?.user?.email) || "donor"
}

function resolveProfileRoleForSession(currentSession: Session): GoogleSignInRole {
  const metadataRole = currentSession.user.user_metadata?.role
  if (isProfileRole(metadataRole)) return metadataRole

  const inferredRole = resolveRoleFromEmail(currentSession.user.email)
  if (isProfileRole(inferredRole)) return inferredRole

  return "donor"
}

function resolveFullNameFromMetadata(metadata: SupabaseUserMetadata | undefined, email?: string | null): string | null {
  const directName = metadata?.full_name || metadata?.name
  if (typeof directName === "string" && directName.trim()) {
    return directName.trim()
  }

  if (email && email.includes("@")) {
    return email.split("@")[0]
  }

  return null
}

function normalizeOptionalProfileField(value?: string | null): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isGoogleSession(currentSession: Session): boolean {
  const provider = currentSession.user.app_metadata?.provider
  if (provider === "google") return true

  const providers = currentSession.user.app_metadata?.providers
  if (Array.isArray(providers) && providers.includes("google")) return true

  const identities = currentSession.user.identities || []
  return identities.some((identity: { provider?: string | null } | null) => identity?.provider === "google")
}

async function syncGoogleProfile(currentSession: Session): Promise<{ role: UserRole; fullName: string | null }> {
  const preferredRole = localStorage.getItem(GOOGLE_ROLE_KEY)
  const metadataFullName = resolveFullNameFromMetadata(currentSession.user.user_metadata, currentSession.user.email)
  const body: Record<string, string> = {}

  if (preferredRole && isProfileRole(preferredRole)) {
    body.role = preferredRole
  }
  if (metadataFullName) {
    body.full_name = metadataFullName
  }

  const response = await fetch(`${BACKEND_BASE_URL}/auth/google/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentSession.access_token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Google profile sync failed" }))
    throw new Error(errorData.detail || "Google profile sync failed")
  }

  const data = await response.json()
  localStorage.removeItem(GOOGLE_ROLE_KEY)

  const roleCandidate = data?.user?.role
  const resolvedRole: UserRole = isKnownRole(roleCandidate) ? roleCandidate : null
  const fullNameCandidate = data?.user?.full_name

  return {
    role: resolvedRole,
    fullName: typeof fullNameCandidate === "string" ? fullNameCandidate : null,
  }
}

async function ensureBackendProfileForSession(currentSession: Session): Promise<void> {
  if (isGoogleSession(currentSession)) return

  const roleToCreate = resolveProfileRoleForSession(currentSession)

  const existingResponse = await fetch(`${BACKEND_BASE_URL}/users/${currentSession.user.id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (existingResponse.ok || existingResponse.status !== 404) {
    return
  }

  const fullName = resolveFullNameFromMetadata(currentSession.user.user_metadata, currentSession.user.email) || "User"
  const phone = normalizeOptionalProfileField(currentSession.user.user_metadata?.phone)
  const address = normalizeOptionalProfileField(currentSession.user.user_metadata?.address)

  const createResponse = await fetch(`${BACKEND_BASE_URL}/users/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: currentSession.user.id,
      full_name: fullName,
      role: roleToCreate,
      phone,
      address,
    }),
  })

  if (!createResponse.ok && createResponse.status !== 409) {
    const errorData = await createResponse.json().catch(() => ({ detail: "Profile sync failed" }))
    throw new Error(errorData.detail || "Profile sync failed")
  }
}

async function getUserRole(userId: string): Promise<UserRole> {
  try {
    // Try to fetch from backend first (more reliable)
    const response = await fetch(`${BACKEND_BASE_URL}/users/${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
    
    if (!response.ok) {
      // Backend unavailable, fall back to email-based detection
      return await getSessionRoleFallback()
    }

    const data = await response.json().catch(() => null)
    const roleCandidate = data?.role
    if (isKnownRole(roleCandidate)) {
      return roleCandidate
    }

    return await getSessionRoleFallback()
  } catch {
    // Error fetching from backend, fall back to email-based detection
    try {
      return await getSessionRoleFallback()
    } catch {
      // Ignore fallback errors
    }
    return "donor"
  }
}

async function getUserProfile(userId: string): Promise<{ fullName: string }> {
  try {
    // Try to fetch from backend first (more reliable)
    const response = await fetch(`${BACKEND_BASE_URL}/users/${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
    
    if (!response.ok) {
      // Missing profile should not trigger extra fallback calls.
      if (response.status === 404) {
        return { fullName: "User" }
      }

      // Fallback to Supabase profiles table if backend is failing unexpectedly.
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .single()
      if (error || !data) return { fullName: "User" }
      return { fullName: data.full_name || "User" }
    }
    
    const data = await response.json()
    return { fullName: data.full_name || "User" }
  } catch {
    return { fullName: "User" }
  }
}

async function buildAuthUserFromSession(currentSession: Session): Promise<AuthUser> {
  let syncedRole: UserRole = null
  let syncedFullName: string | null = null

  if (isGoogleSession(currentSession)) {
    try {
      const synced = await syncGoogleProfile(currentSession)
      syncedRole = synced.role
      syncedFullName = synced.fullName
    } catch (error) {
      console.warn("[AUTH] Google profile sync failed, using fallback detection", error)
    }
  } else {
    try {
      await ensureBackendProfileForSession(currentSession)
    } catch (error) {
      console.warn("[AUTH] Profile sync for non-Google session failed", error)
    }
  }

  const [fallbackRole, profile] = await Promise.all([
    getUserRole(currentSession.user.id),
    getUserProfile(currentSession.user.id),
  ])

  const resolvedRole = syncedRole || fallbackRole || "donor"
  const resolvedFullName = syncedFullName || profile.fullName || currentSession.user.email?.split("@")[0] || "User"

  return {
    id: currentSession.user.id,
    email: currentSession.user.email || "",
    fullName: resolvedFullName,
    role: resolvedRole,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }: { data: { session: Session | null } }) => {
      setSession(currentSession)
      if (currentSession) {
        localStorage.removeItem(AUTH_KEY)
        try {
          const authUser = await buildAuthUserFromSession(currentSession)
          setUser(authUser)
          setUserRole(authUser.role)
        } catch {
          const email = currentSession.user.email || ""
          const role = resolveRoleFromEmail(email) || "donor"
          setUser({
            id: currentSession.user.id,
            email,
            fullName: email.split("@")[0],
            role,
          })
          setUserRole(role)
        }
      } else {
        const stored = localStorage.getItem(AUTH_KEY)
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as AuthUser
            setUser(parsed)
            setUserRole(parsed.role)
          } catch {
            localStorage.removeItem(AUTH_KEY)
          }
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
      setSession(newSession)
      if (newSession) {
        localStorage.removeItem(AUTH_KEY)
        void buildAuthUserFromSession(newSession)
          .then((authUser) => {
            setUser(authUser)
            setUserRole(authUser.role)
          })
          .catch(() => {
            const email = newSession.user.email || ""
            const role = resolveRoleFromEmail(email) || "donor"
            setUser({
              id: newSession.user.id,
              email,
              fullName: email.split("@")[0],
              role,
            })
            setUserRole(role)
          })
      }
      // Don't clear user when session is null — demo users stored in localStorage
      // should persist across navigation. Only signOut() clears the user.
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      localStorage.removeItem(AUTH_KEY)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      if (data.session) {
        setSession(data.session)
        const authUser = await buildAuthUserFromSession(data.session)
        setUser(authUser)
        setUserRole(authUser.role)
      }
      return { error: null }
    } catch {
      return { error: "Login gagal. Silakan coba lagi." }
    }
  }

  const signInWithGoogle = async (role: GoogleSignInRole = "donor") => {
    try {
      localStorage.removeItem(AUTH_KEY)
      localStorage.setItem(GOOGLE_ROLE_KEY, role)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch {
      return { error: "Login Google gagal. Silakan coba lagi." }
    }
  }

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: string,
    profileData?: { phone?: string; address?: string }
  ) => {
    try {
      console.log("[SIGNUP] Starting registration for:", email, "role:", role)
      const normalizedPhone = normalizeOptionalProfileField(profileData?.phone)
      const normalizedAddress = normalizeOptionalProfileField(profileData?.address)
      
      // Step 1: Create auth user in Supabase
      console.log("[SIGNUP] Step 1: Creating Supabase auth user...")
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            phone: normalizedPhone,
            address: normalizedAddress,
          },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) {
        console.error("[SIGNUP] Supabase signup error:", error)
        return { error: error.message }
      }
      if (!data.user) {
        console.error("[SIGNUP] No user returned from Supabase")
        return { error: "Signup failed: No user created" }
      }
      console.log("[SIGNUP] ✓ Supabase auth user created:", data.user.id)

      // Step 2: Create user profile in backend database
      console.log("[SIGNUP] Step 2: Creating backend user profile...")
      let backendSuccess = false
      try {
        const profileResponse = await fetch(`${BACKEND_BASE_URL}/users/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: data.user.id,
            full_name: fullName,
            role,
            phone: normalizedPhone,
            address: normalizedAddress,
          }),
        })

        if (!profileResponse.ok && profileResponse.status !== 409) {
          const errorData = await profileResponse.json().catch(() => ({ detail: "Unknown error" }))
          console.error("[SIGNUP] Backend returned error:", profileResponse.status, errorData)
          return { 
            error: `Profile creation failed: ${errorData.detail || "Unknown error"}` 
          }
        }

        if (profileResponse.status === 409) {
          console.warn("[SIGNUP] Profile already exists, continuing signup flow")
        } else {
          const backendData = await profileResponse.json()
          console.log("[SIGNUP] ✓ Backend user profile created:", backendData)
        }
        backendSuccess = true
      } catch (backendError) {
        console.error("[SIGNUP] Backend connection error:", backendError)
        return { 
          error: "Backend server is not responding. Please try again or contact support." 
        }
      }

      if (!backendSuccess) {
        return { error: "Failed to create user profile. Please try again." }
      }

      // Step 3: Auto-login after signup
      console.log("[SIGNUP] Step 3: Auto-logging in...")
      let session = data.session
      if (!session) {
        // If no immediate session (email verification required), try to sign in directly
        console.log("[SIGNUP] No immediate session, attempting direct signin...")
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (!signInError && signInData.session) {
          session = signInData.session
          console.log("[SIGNUP] ✓ Auto-login successful")
        } else {
          console.log("[SIGNUP] Auto-login failed, user will need to login manually")
        }
      }

      if (session) {
        setSession(session)
        localStorage.removeItem(AUTH_KEY)
        const authUser = await buildAuthUserFromSession(session)
        setUser(authUser)
        setUserRole(authUser.role)
        console.log("[SIGNUP] ✓ Registration complete and logged in")
      } else {
        // Fallback: set user data without session (will require manual login)
        setUser({
          id: data.user.id,
          email: data.user.email || "",
          fullName,
          role: role as UserRole,
        })
        setUserRole(role as UserRole)
        console.log("[SIGNUP] ✓ Registration complete, please login")
      }
      return { error: null }
    } catch (error) {
      console.error("[SIGNUP] Unexpected error:", error)
      return { error: "Registrasi gagal. Silakan coba lagi." }
    }
  }

  const signInAsDemo = (role: UserRole) => {
    const demoUsers: Record<string, AuthUser> = {
      donor: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "donor@nutriguard.id",
        fullName: "Donor Demo",
        role: "donor",
      },
      beneficiary: {
        id: "00000000-0000-0000-0000-000000000002",
        email: "penerima@nutriguard.id",
        fullName: "Penerima Demo",
        role: "beneficiary",
      },
      vendor: {
        id: "00000000-0000-0000-0000-000000000003",
        email: "vendor@nutriguard.id",
        fullName: "Vendor Demo",
        role: "vendor",
      },
    }
    const demoUser = demoUsers[role || "donor"]
    setUser(demoUser)
    setUserRole(demoUser.role)
    setSession(null)
    localStorage.setItem(AUTH_KEY, JSON.stringify(demoUser))
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole(null)
    setSession(null)
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(GOOGLE_ROLE_KEY)
  }

  const value = {
    user,
    userRole,
    loading,
    session,
    signIn,
    signInWithGoogle,
    signUp,
    signInAsDemo,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
