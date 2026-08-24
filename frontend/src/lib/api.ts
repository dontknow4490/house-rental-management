export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // When running in browser, use same-origin relative path /api (proxied via Next.js rewrites to NestJS)
    return '/api';
  }
  return 'http://127.0.0.1:4000/api';
}

export function getFileUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (typeof window !== 'undefined') {
    // In browser, use same-origin path /uploads/... which Next.js rewrites internally to NestJS
    return path.startsWith('/') ? path : '/' + path;
  }
  return `http://127.0.0.1:4000${path.startsWith('/') ? path : '/' + path}`;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  // Retrieve token from localStorage if available (for LAN browser cross-origin support)
  let token = '';
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || '';
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      window.location.href = '/login';
    }
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.message || (Array.isArray(data?.message) ? data.message.join(', ') : 'Request failed');
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  get: <T = any>(url: string) => fetchApi<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) =>
    fetchApi<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T = any>(url: string, body?: any) =>
    fetchApi<T>(url, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T = any>(url: string) => fetchApi<T>(url, { method: 'DELETE' }),
};
