import type { VercelRequest } from '@vercel/node';
import { createServiceClient } from './supabase';

export interface ServerProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator';
  is_active: boolean;
}

export interface AuthenticatedRequest {
  userId: string;
  email: string;
  accessToken: string;
  profile: ServerProfile;
}

function bearerToken(req: VercelRequest): string {
  const rawAuthorization = req.headers.authorization;
  const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Token login tidak ditemukan.');
  return authorization.slice('Bearer '.length).trim();
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function requireUser(req: VercelRequest): Promise<AuthenticatedRequest> {
  const accessToken = bearerToken(req);
  const service = createServiceClient();
  const { data, error } = await service.auth.getUser(accessToken);
  if (error || !data.user) throw new HttpError(401, 'Sesi login tidak valid atau sudah berakhir.');

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id,email,full_name,role,is_active')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) throw new HttpError(403, 'Profil pengguna tidak ditemukan.');
  if (!profile.is_active) throw new HttpError(403, 'Akun pengguna dinonaktifkan.');

  return {
    userId: data.user.id,
    email: data.user.email ?? profile.email,
    accessToken,
    profile: profile as ServerProfile,
  };
}

export async function requireAdmin(req: VercelRequest): Promise<AuthenticatedRequest> {
  const authenticated = await requireUser(req);
  if (authenticated.profile.role !== 'admin') throw new HttpError(403, 'Akses hanya untuk Admin.');
  return authenticated;
}
