const API_BASE = "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("taskcatch_access_token");
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include", // send httpOnly cookies
  });

  if (res.status === 401 && !endpoint.includes("/api/auth/login") && !endpoint.includes("/api/auth/refresh")) {
    // Attempt token refresh
    const refreshed = await attemptRefreshToken();
    if (refreshed) {
      // Retry once with new token
      return apiRequest<T>(endpoint, options);
    }
  }

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.statusText}`;
    let data;
    try {
      data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {
      // ignore non-json error
    }
    throw new ApiError(res.status, errorMsg, data);
  }

  return (await res.json()) as T;
}

async function attemptRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("taskcatch_refresh_token");
  if (!refreshToken) return false;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      if (data.tokens?.accessToken) {
        localStorage.setItem("taskcatch_access_token", data.tokens.accessToken);
        if (data.tokens.refreshToken) {
          localStorage.setItem("taskcatch_refresh_token", data.tokens.refreshToken);
        }
        return true;
      }
    }
  } catch {
    // Refresh failed
  }

  localStorage.removeItem("taskcatch_access_token");
  localStorage.removeItem("taskcatch_refresh_token");
  return false;
}
