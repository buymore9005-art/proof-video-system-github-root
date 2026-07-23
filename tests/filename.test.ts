import { buildVideoPath, extensionFromMimeType, sanitizeFilePart } from '../src/lib/filename';

describe('filename', () => {
  it('sanitizes unsupported storage path characters', () => {
    expect(sanitizeFilePart('ORDER / 001?#')).toBe('ORDER_001');
  });

  it('selects extension from mime type', () => {
    expect(extensionFromMimeType('video/mp4;codecs=h264')).toBe('mp4');
    expect(extensionFromMimeType('video/webm;codecs=vp9')).toBe('webm');
  });

  it('builds an operator-owned dated path', () => {
    const result = buildVideoPath({
      operatorId: 'user-id',
      sessionId: 'session-id',
      orderNumber: 'ORDER001',
      sequenceNo: 2,
      startedAt: '2026-07-21T01:00:00.000Z',
      mimeType: 'video/webm',
    });
    expect(result.filename).toBe('0002_ORDER001.webm');
    expect(result.path).toBe('user-id/2026/07/21/session-id/0002_ORDER001.webm');
  });
});
