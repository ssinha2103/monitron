const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const ACCESS_TOKEN_KEY = 'monitron_access_token';

let accessToken: string | null = localStorage.getItem(ACCESS_TOKEN_KEY);

export const authStore = {
  get token() {
    return accessToken;
  },
  set token(value: string | null) {
    accessToken = value;
    if (value) {
      localStorage.setItem(ACCESS_TOKEN_KEY, value);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }
};

async function refreshToken(): Promise<boolean> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    authStore.token = null;
    return false;
  }

  const data = await response.json();
  authStore.token = data.access_token;
  return true;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (authStore.token) {
    headers.set('Authorization', `Bearer ${authStore.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiRequest<T>(path, options, false);
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const raw = await response.text();
    try {
      const payload = JSON.parse(raw);
      const message = payload.detail ?? payload.message ?? raw;
      throw new Error(message);
    } catch (error) {
      throw new Error(raw || response.statusText);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type ApiUser = {
  id: number;
  email: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LoginPayload = { email: string; password: string };

type RegisterPayload = { email: string; password: string; full_name?: string };

export async function login(payload: LoginPayload) {
  const data = await apiRequest<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  authStore.token = data.access_token;
  return data;
}

export async function register(payload: RegisterPayload) {
  const data = await apiRequest<{ access_token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  authStore.token = data.access_token;
  return data;
}

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
  authStore.token = null;
}

export async function fetchMe(): Promise<ApiUser> {
  return apiRequest<ApiUser>('/auth/me');
}

export async function forgotPassword(email: string) {
  return apiRequest<{ message: string; token?: string }>('/auth/forgot', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, password: string) {
  return apiRequest<{ message: string }>('/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password })
  });
}

export async function fetchMonitors() {
  return apiRequest('/monitors');
}

export async function createMonitor(payload: {
  name: string;
  url: string;
  method: string;
  interval_seconds: number;
  timeout_seconds: number;
  enabled?: boolean;
}) {
  return apiRequest('/monitors', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateMonitor(id: number, payload: Record<string, unknown>) {
  return apiRequest(`/monitors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function pauseMonitor(id: number) {
  return apiRequest(`/monitors/${id}`, { method: 'DELETE' });
}

export async function resumeMonitor(id: number) {
  return apiRequest(`/monitors/${id}/resume`, { method: 'POST' });
}

export async function runMonitor(id: number) {
  return apiRequest(`/monitors/${id}/run`, { method: 'POST' });
}

export async function fetchMonitorChecks(id: number) {
  return apiRequest(`/monitors/${id}/checks`);
}

export async function fetchUsers() {
  return apiRequest<ApiUser[]>('/admin/users');
}

export async function updateUser(id: number, payload: Record<string, unknown>) {
  return apiRequest<ApiUser>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
