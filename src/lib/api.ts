import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: string; details?: unknown }
    | null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Permintaan gagal (${response.status}).`, response.status, payload?.details);
  }

  return (payload?.data ?? payload) as T;
}
