import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

export function ok<T>(res: VercelResponse, data: T, status = 200): void {
  json(res, status, { data });
}

export function fail(res: VercelResponse, status: number, error: string, details?: unknown): void {
  json(res, status, { error, ...(details === undefined ? {} : { details }) });
}

export function methodNotAllowed(res: VercelResponse, methods: string[]): void {
  res.setHeader('Allow', methods.join(', '));
  fail(res, 405, `Metode tidak diizinkan. Gunakan ${methods.join(', ')}.`);
}

export function bodyOf<T>(req: VercelRequest): T {
  if (typeof req.body === 'string') return JSON.parse(req.body) as T;
  return (req.body ?? {}) as T;
}

export function serverError(res: VercelResponse, error: unknown): void {
  console.error(error);
  fail(res, 500, 'Terjadi kesalahan pada server. Periksa log Vercel untuk detail.');
}
