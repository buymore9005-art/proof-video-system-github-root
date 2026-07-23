import { supabase } from './supabase';
import type { VideoRecord } from '../types/database';

export async function createVideoSignedUrl(
  video: Pick<VideoRecord, 'storage_bucket' | 'storage_path' | 'filename'>,
  download = false,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(video.storage_bucket)
    .createSignedUrl(video.storage_path, 3600, download ? { download: video.filename } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function storedVideoExists(path: string): Promise<boolean> {
  const parts = path.split('/').filter(Boolean);
  const filename = parts.pop();
  if (!filename) return false;
  const folder = parts.join('/');
  const { data, error } = await supabase.storage
    .from('proof-videos')
    .list(folder, { limit: 10, search: filename });
  if (error) throw error;
  return (data ?? []).some((item: { name: string }) => item.name === filename);
}
