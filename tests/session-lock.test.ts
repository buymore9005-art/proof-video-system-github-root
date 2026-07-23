import { describe, expect, it } from 'vitest';
import {
  clearActiveRecordingSession,
  getActiveRecordingSession,
  hasActiveRecordingSession,
  setActiveRecordingSession,
  type StorageWriter,
} from '../src/lib/session-lock';

function createMemoryStorage(): StorageWriter {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('recording session lock', () => {
  it('menyimpan dan membaca sesi aktif', () => {
    const storage = createMemoryStorage();

    setActiveRecordingSession(storage, 'session-123');

    expect(getActiveRecordingSession(storage)).toBe('session-123');
    expect(hasActiveRecordingSession(storage)).toBe(true);
  });

  it('menghapus sesi aktif', () => {
    const storage = createMemoryStorage();
    setActiveRecordingSession(storage, 'session-123');

    clearActiveRecordingSession(storage);

    expect(getActiveRecordingSession(storage)).toBeNull();
    expect(hasActiveRecordingSession(storage)).toBe(false);
  });

  it('menolak session ID kosong', () => {
    const storage = createMemoryStorage();

    expect(() => setActiveRecordingSession(storage, '   ')).toThrow(
      'Session ID aktif tidak boleh kosong.',
    );
  });
});
