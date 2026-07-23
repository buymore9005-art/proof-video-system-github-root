import { buildTusEndpoint } from '../src/lib/storage-endpoint';
import { baseMimeType, buildTusFingerprint } from '../src/lib/upload-protocol';

describe('Supabase TUS upload', () => {
  it('uses the direct storage hostname', () => {
    expect(buildTusEndpoint('abc123')).toBe(
      'https://abc123.storage.supabase.co/storage/v1/upload/resumable',
    );
  });

  it('normalizes MediaRecorder MIME parameters for Storage', () => {
    expect(baseMimeType('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseMimeType('')).toBe('application/octet-stream');
  });

  it('builds a path-specific fingerprint so equal-size blobs never collide', () => {
    const file = { size: 1024, type: 'video/webm' };
    expect(buildTusFingerprint('user-a/session/order-1.webm', file)).not.toBe(
      buildTusFingerprint('user-a/session/order-2.webm', file),
    );
  });
});
