import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { writeAudit } from './_lib/audit';
import { bodyOf, fail, methodNotAllowed, ok, serverError } from './_lib/http';
import { createServiceClient, serverEnv } from './_lib/supabase';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value: string) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  setupSecret: z.string().min(16).max(512),
});

function secretsMatch(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function setupRequired(): Promise<boolean> {
  const service = createServiceClient();
  const { count, error } = await service.from('profiles').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  let claimToken: string | null = null;
  let createdUserId: string | null = null;
  let service: ReturnType<typeof createServiceClient> | null = null;

  try {
    if (req.method === 'GET') {
      return ok(res, { setupRequired: await setupRequired() });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

    const parsed = schema.safeParse(bodyOf(req));
    if (!parsed.success) return fail(res, 400, 'Data setup tidak valid.', parsed.error.flatten());
    if (!secretsMatch(parsed.data.setupSecret, serverEnv.setupSecret)) {
      return fail(res, 403, 'SETUP_SECRET tidak cocok.');
    }

    service = createServiceClient();
    const { data: claimed, error: claimError } = await service.rpc('claim_initial_setup');
    if (claimError || !claimed) {
      return fail(res, 409, claimError?.message ?? 'Setup tidak dapat diklaim.');
    }
    claimToken = claimed;

    const { data, error } = await service.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });
    if (error || !data.user) throw error ?? new Error('Supabase tidak mengembalikan user baru.');
    createdUserId = data.user.id;

    const { error: profileError } = await service
      .from('profiles')
      .update({ full_name: parsed.data.fullName, role: 'admin', is_active: true })
      .eq('id', data.user.id);
    if (profileError) throw profileError;

    const { error: completeError } = await service.rpc('complete_initial_setup', {
      p_claim_token: claimToken,
    });
    if (completeError) throw completeError;

    await writeAudit({
      actorId: data.user.id,
      actorName: parsed.data.fullName,
      action: 'initial_admin_created',
      entityType: 'profile',
      entityId: data.user.id,
      details: { email: parsed.data.email },
    });

    ok(res, { userId: data.user.id }, 201);
  } catch (error) {
    if (service && createdUserId) {
      const { error: deleteError } = await service.auth.admin.deleteUser(createdUserId);
      if (deleteError) console.error('Rollback user setup gagal:', deleteError.message);
    }
    if (service && claimToken) {
      const { error: releaseError } = await service.rpc('release_initial_setup', {
        p_claim_token: claimToken,
      });
      if (releaseError) console.error('Rollback claim setup gagal:', releaseError.message);
    }
    serverError(res, error);
  }
}
