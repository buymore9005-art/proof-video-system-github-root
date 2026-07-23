export function buildTusEndpoint(projectRef: string): string {
  const normalized = projectRef.trim();
  if (!/^[a-z0-9-]+$/i.test(normalized)) {
    throw new Error('Supabase project ref tidak valid.');
  }
  return `https://${normalized}.storage.supabase.co/storage/v1/upload/resumable`;
}
