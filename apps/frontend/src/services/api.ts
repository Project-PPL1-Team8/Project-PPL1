import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
let accessTokenCache: string | null = null;
let sessionInitPromise: Promise<void> | null = null;
let isRefreshingToken = false;

type StoredAuthUser = {
  id?: string;
  email?: string;
  role?: string;
};

const isKnownDevRole = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const role = value.trim().toLowerCase();
  return ["donor", "beneficiary", "vendor", "admin", "government", "corporate_donor"].includes(role);
};

const isAuthLockError = (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("NavigatorLockAcquireTimeoutError") ||
    msg.includes("Lock broken by another request") ||
    msg.includes("was not released within")
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function initSessionToken() {
  if (sessionInitPromise) {
    await sessionInitPromise;
    return;
  }

  sessionInitPromise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        accessTokenCache = session?.access_token ?? null;
        return;
      } catch (error) {
        if (!isAuthLockError(error) || attempt === 3) {
          return;
        }
        await wait(120 * attempt);
      }
    }
  })();

  await sessionInitPromise;
  sessionInitPromise = null;
}

async function refreshSessionToken(): Promise<string | null> {
  if (isRefreshingToken) {
    // Wait for ongoing refresh
    while (isRefreshingToken) {
      await wait(100);
    }
    return accessTokenCache;
  }

  isRefreshingToken = true;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error("Failed to refresh session:", error);
      return null;
    }
    accessTokenCache = data.session?.access_token ?? null;
    return accessTokenCache;
  } finally {
    isRefreshingToken = false;
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  accessTokenCache = session?.access_token ?? null;
});

class ApiError extends Error {
  status: number;
  endpoint: string;
  detail: unknown;

  constructor(message: string, status: number, endpoint: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

async function apiFetchWithRetry(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Attach Supabase JWT as Bearer token if available.
  await initSessionToken();
  if (accessTokenCache) {
    headers["Authorization"] = `Bearer ${accessTokenCache}`;
  } else {
    // Attach development identity headers only for demo/local-storage auth.
    let devIdentity: StoredAuthUser = {};
    try {
      const rawStoredAuth = localStorage.getItem("nutriguard-auth");
      if (rawStoredAuth) {
        const storedAuth: StoredAuthUser = JSON.parse(rawStoredAuth);
        devIdentity = {
          id: storedAuth?.id,
          email: storedAuth?.email,
          role: isKnownDevRole(storedAuth?.role)
            ? storedAuth.role.trim().toLowerCase()
            : undefined,
        };
      }
    } catch {
      // Ignore malformed local auth cache.
    }

    if (devIdentity.id) headers["X-Dev-User-Id"] = devIdentity.id;
    if (devIdentity.email) headers["X-Dev-User-Email"] = devIdentity.email;
    if (devIdentity.role) headers["X-Dev-User-Role"] = devIdentity.role;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - Token expired
  if (response.status === 401 && retryCount === 0) {
    console.log(`[API] 401 on ${endpoint}, attempting token refresh...`);

    const newToken = await refreshSessionToken();

    if (newToken) {
      console.log(`[API] Token refreshed, retrying ${endpoint}...`);
      // Retry with new token
      return apiFetchWithRetry(endpoint, options, retryCount + 1);
    } else {
      console.error(`[API] Token refresh failed for ${endpoint}`);
      // Token refresh failed - session expired
      toast.error("Sesi Anda telah berakhir", {
        description: "Silakan login kembali",
      });

      // Clear cache and redirect to login after a short delay
      accessTokenCache = null;
      setTimeout(() => {
        window.location.href = "/login?expired=true";
      }, 2000);

      throw new ApiError("Session expired", 401, endpoint, { message: "Token refresh failed" });
    }
  }

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let payload: unknown = null;
  if (responseText) {
    if (isJson) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = { detail: responseText };
      }
    } else {
      payload = { detail: responseText };
    }
  }

  if (!response.ok) {
    const error = (payload as { detail?: string }) || { detail: "Request failed" };
    const errorMsg = error.detail || `Request failed (${response.status})`;
    console.error(`[API ERROR ${response.status}] ${endpoint}:`, errorMsg, error);
    throw new ApiError(errorMsg, response.status, endpoint, error);
  }

  return payload;
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  return apiFetchWithRetry(endpoint, options, 0);
}

export { apiFetch, API_BASE_URL, ApiError };
