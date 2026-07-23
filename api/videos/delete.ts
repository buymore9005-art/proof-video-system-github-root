import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { writeAudit } from '../_lib/audit';
import { HttpError, requireAdmin } from '../_lib/auth';
import { bodyOf, fail, methodNotAllowed, ok, serverError } from '../_lib/http';
import { createServiceClient } from '../_lib/supabase';

const schema = z.object({
  videoId: z.string().uuid(),
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    const actor = await requireAdmin(req);
    const parsed = schema.safeParse(bodyOf(req));
    if (!parsed.success) return fail(res, 400, 'ID video tidak valid.', parsed.error.flatten());

    const service = createServiceClient();
    const { data: video, error: findError } = await service
      .from('videos')
      .select('*')
      .eq('id', parsed.data.videoId)
      .is('deleted_at', null)
      .single();
    if (findError || !video) return fail(res, 404, 'Video tidak ditemukan.');

    const { error: markError } = await service
      .from('videos')
      .update({
        upload_status: 'deleted',
        processing_status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', video.id)
      .is('deleted_at', null);
    if (markError) throw markError;

    if (video.upload_status === 'completed') {
      const { error: removeError } = await service.storage
        .from(video.storage_bucket)
        .remove([video.storage_path]);

      if (removeError) {
        const { error: restoreError } = await service
          .from('videos')
          .update({
            upload_status: video.upload_status,
            processing_status: video.processing_status,
            deleted_at: null,
          })
          .eq('id', video.id);
        if (restoreError) console.error('Gagal memulihkan metadata video:', restoreError.message);
        throw removeError;
      }
    }

    await writeAudit({
      actorId: actor.userId,
      actorName: actor.profile.full_name,
      action: 'video_deleted',
      entityType: 'video',
      entityId: video.id,
      details: {
        order_number: video.order_number,
        storage_path: video.storage_path,
      },
    });

    ok(res, { deleted: true });
  } catch (error) {
    if (error instanceof HttpError) return fail(res, error.status, error.message, error.details);
    serverError(res, error);
  }
}
