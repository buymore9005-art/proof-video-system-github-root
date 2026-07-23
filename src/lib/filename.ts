import { getDateParts } from './date';

export function sanitizeFilePart(value: string, fallback = 'UNKNOWN'): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
    .slice(0, 100);
  return sanitized || fallback;
}

export function extensionFromMimeType(mimeType: string): 'mp4' | 'webm' {
  return mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}

export interface VideoPathInput {
  operatorId: string;
  sessionId: string;
  orderNumber: string;
  sequenceNo: number;
  startedAt: string | Date;
  mimeType: string;
}

export function buildVideoPath(input: VideoPathInput): { filename: string; path: string } {
  const { year, month, day } = getDateParts(input.startedAt);
  const extension = extensionFromMimeType(input.mimeType);
  const sequence = input.sequenceNo.toString().padStart(4, '0');
  const order = sanitizeFilePart(input.orderNumber);
  const session = sanitizeFilePart(input.sessionId);
  const operator = sanitizeFilePart(input.operatorId);
  const filename = `${sequence}_${order}.${extension}`;
  return {
    filename,
    path: `${operator}/${year}/${month}/${day}/${session}/${filename}`,
  };
}
