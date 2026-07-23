export const ACTIVE_RECORDING_SESSION_KEY = 'proof-video.active-recording-session';

export interface StorageReader {
  getItem(key: string): string | null;
}

export interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getActiveRecordingSession(storage: StorageReader): string | null {
  const value = storage.getItem(ACTIVE_RECORDING_SESSION_KEY)?.trim();
  return value || null;
}

export function setActiveRecordingSession(storage: StorageWriter, sessionId: string): void {
  const value = sessionId.trim();
  if (!value) throw new Error('Session ID aktif tidak boleh kosong.');
  storage.setItem(ACTIVE_RECORDING_SESSION_KEY, value);
}

export function clearActiveRecordingSession(storage: StorageWriter): void {
  storage.removeItem(ACTIVE_RECORDING_SESSION_KEY);
}

export function hasActiveRecordingSession(storage: StorageReader): boolean {
  return getActiveRecordingSession(storage) !== null;
}
