export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export function baseMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

export function buildTusFingerprint(
  objectPath: string,
  file: { size: number; type: string },
): string {
  return `proof-video:${objectPath}:${file.size}:${baseMimeType(file.type)}`;
}
