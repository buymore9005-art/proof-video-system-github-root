export type LocalUploadStatus = 'queued' | 'uploading' | 'failed';

export interface UploadJob {
  id: string;
  userId: string;
  sessionId: string;
  orderNumber: string;
  barcode: string;
  sequenceNo: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  filename: string;
  mimeType: string;
  filesize: number;
  storagePath: string;
  blob: Blob;
  status: LocalUploadStatus;
  progress: number;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'proof-video-upload-queue';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB tidak dapat dibuka.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('userId')) store.createIndex('userId', 'userId', { unique: false });
      if (!store.indexNames.contains('createdAt')) {
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Transaksi IndexedDB gagal.'));
    };
    operation(store, resolve, reject);
  });
}

export async function putUploadJob(job: UploadJob): Promise<void> {
  return runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(job);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUploadJob(id: string): Promise<UploadJob | null> {
  return runTransaction<UploadJob | null>('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as UploadJob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listUploadJobs(userId: string): Promise<UploadJob[]> {
  return runTransaction<UploadJob[]>('readonly', (store, resolve, reject) => {
    const request = store.index('userId').getAll(userId);
    request.onsuccess = () => {
      const jobs = (request.result as UploadJob[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(jobs);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function patchUploadJob(id: string, patch: Partial<UploadJob>): Promise<UploadJob> {
  const current = await getUploadJob(id);
  if (!current) throw new Error('Antrean upload tidak ditemukan.');
  const updated: UploadJob = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };
  await putUploadJob(updated);
  return updated;
}

export async function deleteUploadJob(id: string): Promise<void> {
  return runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
