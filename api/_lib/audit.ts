import { createServiceClient } from './supabase';

export async function writeAudit(input: {
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from('activity_logs').insert({
    actor_id: input.actorId,
    actor_name: input.actorName,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
  });
  if (error) console.error('Gagal menulis audit log:', error.message);
}
