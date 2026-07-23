import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, requireAdmin } from './_lib/auth';
import { writeAudit } from './_lib/audit';
import { bodyOf, fail, methodNotAllowed, ok, serverError } from './_lib/http';
import { createServiceClient } from './_lib/supabase';


interface UserUpdateInput {
  userId: string;
  full_name?: string;
  role?: 'admin' | 'operator';
  is_active?: boolean;
  password?: string;
}

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).transform((value: string) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  role: z.enum(['admin', 'operator']).default('operator'),
});

const updateSchema = z
  .object({
    userId: z.string().uuid(),
    full_name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(['admin', 'operator']).optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(10).max(128).optional(),
  })
  .refine(
    (value: UserUpdateInput) =>
      value.full_name !== undefined ||
      value.role !== undefined ||
      value.is_active !== undefined ||
      value.password !== undefined,
    { message: 'Tidak ada perubahan yang dikirim.' },
  );

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const actor = await requireAdmin(req);
    const service = createServiceClient();

    if (req.method === 'GET') {
      const { data, error } = await service.from('profiles').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return ok(res, { users: data ?? [] });
    }

    if (req.method === 'POST') {
      const parsed = createSchema.safeParse(bodyOf(req));
      if (!parsed.success) return fail(res, 400, 'Data pengguna tidak valid.', parsed.error.flatten());

      const { data, error } = await service.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.fullName },
      });
      if (error || !data.user) throw error ?? new Error('User baru tidak berhasil dibuat.');

      const { error: profileError } = await service
        .from('profiles')
        .update({ full_name: parsed.data.fullName, role: parsed.data.role, is_active: true })
        .eq('id', data.user.id);
      if (profileError) {
        await service.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }

      await writeAudit({
        actorId: actor.userId,
        actorName: actor.profile.full_name,
        action: 'user_created',
        entityType: 'profile',
        entityId: data.user.id,
        details: { email: parsed.data.email, role: parsed.data.role },
      });
      return ok(res, { userId: data.user.id }, 201);
    }

    if (req.method === 'PATCH') {
      const parsed = updateSchema.safeParse(bodyOf(req));
      if (!parsed.success) return fail(res, 400, 'Perubahan pengguna tidak valid.', parsed.error.flatten());
      if (parsed.data.userId === actor.userId && parsed.data.is_active === false) {
        return fail(res, 400, 'Admin tidak dapat menonaktifkan akunnya sendiri.');
      }
      if (parsed.data.userId === actor.userId && parsed.data.role === 'operator') {
        return fail(res, 400, 'Admin tidak dapat menurunkan role akunnya sendiri.');
      }

      if (parsed.data.password) {
        const { error } = await service.auth.admin.updateUserById(parsed.data.userId, {
          password: parsed.data.password,
        });
        if (error) throw error;
      }

      const profilePatch: Record<string, unknown> = {};
      if (parsed.data.full_name !== undefined) profilePatch.full_name = parsed.data.full_name;
      if (parsed.data.role !== undefined) profilePatch.role = parsed.data.role;
      if (parsed.data.is_active !== undefined) profilePatch.is_active = parsed.data.is_active;

      if (Object.keys(profilePatch).length > 0) {
        const { error } = await service.from('profiles').update(profilePatch).eq('id', parsed.data.userId);
        if (error) throw error;
      }

      await writeAudit({
        actorId: actor.userId,
        actorName: actor.profile.full_name,
        action: 'user_updated',
        entityType: 'profile',
        entityId: parsed.data.userId,
        details: {
          full_name: parsed.data.full_name,
          role: parsed.data.role,
          is_active: parsed.data.is_active,
          password_changed: Boolean(parsed.data.password),
        },
      });
      return ok(res, { updated: true });
    }

    methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  } catch (error) {
    if (error instanceof HttpError) return fail(res, error.status, error.message, error.details);
    serverError(res, error);
  }
}
