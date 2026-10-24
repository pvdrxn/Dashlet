import type { RegisterDto, LoginDto, AuthResponseDto, UserDto, SessionDto, ChangePasswordDto, ChangeEmailDto } from '@widget-master/shared';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3002/api/v1/auth'
  : '/api/v1/auth';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<AuthResponseDto> | null = null;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    headers,
    ...options,
  });

  if (res.status === 401 && refreshToken && !url.includes('/auth/refresh') && !url.includes('/auth/login') && !url.includes('/auth/register')) {
    try {
      await refreshAccessToken();
      return request(url, options);
    } catch {
      clearTokens();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

function setTokens(data: AuthResponseDto) {
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

async function refreshAccessToken(): Promise<AuthResponseDto> {
  if (!refreshToken) throw new Error('No refresh token');
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const res = await fetch(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      throw new Error('Refresh failed');
    }
    const data = await res.json();
    setTokens(data);
    return data;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function isAuthenticated(): boolean {
  return !!accessToken;
}

export async function register(dto: RegisterDto): Promise<AuthResponseDto> {
  const data = await request<AuthResponseDto>(`${BASE}/register`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  setTokens(data);
  return data;
}

export async function login(dto: LoginDto): Promise<AuthResponseDto> {
  const data = await request<AuthResponseDto>(`${BASE}/login`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  setTokens(data);
  return data;
}

export async function logout(): Promise<void> {
  if (refreshToken) {
    await request(`${BASE}/logout`, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearTokens();
}

export async function getMe(): Promise<UserDto> {
  return request<UserDto>(`${BASE}/me`);
}

export async function getSessions(): Promise<SessionDto[]> {
  return request<SessionDto[]>(`${BASE}/sessions`);
}

export async function revokeSession(id: string): Promise<void> {
  return request<void>(`${BASE}/sessions/${id}`, { method: 'DELETE' });
}

export async function changePassword(dto: ChangePasswordDto): Promise<void> {
  return request<void>(`${BASE}/password`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function changeEmail(dto: ChangeEmailDto): Promise<UserDto> {
  return request<UserDto>(`${BASE}/email`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteAccount(password: string): Promise<void> {
  return request<void>(`${BASE}/account`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}