import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage } from '../lib/format';
import { supabase } from '../lib/supabase';
import { uploadVideoWithTus } from '../lib/tus-upload';
import { storedVideoExists } from '../lib/video';
import {
  deleteUploadJob,
  listUploadJobs,
  patchUploadJob,
  putUploadJob,
  type UploadJob,
} from '../lib/upload-db';
import { useAuth } from './auth-provider';
import { useSettings } from './settings-provider';
import { useToast } from './toast-provider';

interface UploadContextValue {
  jobs: UploadJob[];
  activeJobId: string | null;
  enqueue: (job: UploadJob) => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const processingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setJobs([]);
      return;
    }

    let nextJobs = await listUploadJobs(user.id);
    if (!processingRef.current) {
      const interrupted = nextJobs.filter((job) => job.status === 'uploading');
      if (interrupted.length > 0) {
        await Promise.all(
          interrupted.map((job) =>
            patchUploadJob(job.id, {
              status: 'queued',
              lastError: 'Upload sebelumnya terhenti dan akan dilanjutkan otomatis.',
            }),
          ),
        );
        nextJobs = await listUploadJobs(user.id);
      }
    }
    setJobs(nextJobs);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refresh]);


  useEffect(() => {
    if (!user) abortRef.current?.abort();
  }, [user]);

  const processQueue = useCallback(async () => {
    if (!user || processingRef.current || !navigator.onLine) return;
    const next = jobs.find(
      (job) =>
        job.userId === user.id &&
        (job.status === 'queued' ||
          (job.status === 'failed' && job.retryCount < settings.uploadMaxRetries)),
    );
    if (!next) return;

    processingRef.current = true;
    setActiveJobId(next.id);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await patchUploadJob(next.id, { status: 'uploading', lastError: null });
      await refresh();

      const { error: registerError } = await supabase.rpc('register_video_segment', {
        p_client_id: next.id,
        p_session_id: next.sessionId,
        p_order_number: next.orderNumber,
        p_barcode: next.barcode,
        p_sequence_no: next.sequenceNo,
        p_start_time: next.startTime,
        p_end_time: next.endTime,
        p_duration_ms: next.durationMs,
        p_filename: next.filename,
        p_mime_type: next.mimeType,
        p_filesize: next.filesize,
        p_storage_path: next.storagePath,
      });
      if (registerError) throw registerError;

      const { error: uploadingError } = await supabase.rpc('mark_video_uploading', {
        p_client_id: next.id,
        p_progress: 0,
      });
      if (uploadingError) throw uploadingError;

      if (await storedVideoExists(next.storagePath)) {
        const { error: existingCompleteError } = await supabase.rpc('complete_video_upload', {
          p_client_id: next.id,
          p_filesize: next.filesize,
          p_mime_type: next.mimeType,
        });
        if (existingCompleteError) throw existingCompleteError;
        await deleteUploadJob(next.id);
        showToast(`${next.orderNumber} sudah tersedia di Storage dan ditandai selesai.`, 'success');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesi login telah berakhir. Silakan login kembali.');

      let lastPersistedProgress = -1;
      await uploadVideoWithTus({
        file: next.blob,
        objectPath: next.storagePath,
        mimeType: next.mimeType,
        accessToken: session.access_token,
        signal: controller.signal,
        onProgress: (progress) => {
          setJobs((current) =>
            current.map((job) => (job.id === next.id ? { ...job, progress } : job)),
          );
          if (progress >= lastPersistedProgress + 5 || progress === 100) {
            lastPersistedProgress = progress;
            void patchUploadJob(next.id, { progress });
            void supabase.rpc('mark_video_uploading', {
              p_client_id: next.id,
              p_progress: progress,
            });
          }
        },
      });

      const { error: completeError } = await supabase.rpc('complete_video_upload', {
        p_client_id: next.id,
        p_filesize: next.filesize,
        p_mime_type: next.mimeType,
      });
      if (completeError) throw completeError;

      await deleteUploadJob(next.id);
      showToast(`${next.orderNumber} berhasil diunggah.`, 'success');
    } catch (error) {
      const message = errorMessage(error);
      const retryCount = next.retryCount + 1;
      await patchUploadJob(next.id, {
        status: 'failed',
        retryCount,
        lastError: message,
      });
      void supabase.rpc('fail_video_upload', {
        p_client_id: next.id,
        p_error: message,
        p_retry_count: retryCount,
      });
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast(`Upload ${next.orderNumber} gagal: ${message}`, 'error');
      }
    } finally {
      abortRef.current = null;
      processingRef.current = false;
      setActiveJobId(null);
      await refresh();
    }
  }, [jobs, refresh, settings.uploadMaxRetries, showToast, user]);

  useEffect(() => {
    void processQueue();
    const timer = window.setInterval(() => void processQueue(), 3000);
    return () => window.clearInterval(timer);
  }, [processQueue]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const enqueue = useCallback(
    async (job: UploadJob) => {
      await putUploadJob(job);
      await refresh();
    },
    [refresh],
  );

  const retry = useCallback(
    async (id: string) => {
      await patchUploadJob(id, { status: 'queued', lastError: null });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const target = jobs.find((job) => job.id === id);
      if (!target) return;
      if (id === activeJobId) {
        showToast('Upload yang sedang berjalan tidak dapat dihapus. Tunggu hingga selesai atau gagal.', 'info');
        return;
      }

      try {
        const { error } = await supabase.rpc('cancel_video_segment', { p_client_id: id });
        if (error) throw error;
        await deleteUploadJob(id);
        await refresh();
        showToast(`Antrean lokal ${target.orderNumber} dihapus.`, 'success');
      } catch (error) {
        showToast(`Antrean tidak dapat dihapus: ${errorMessage(error)}`, 'error');
      }
    },
    [activeJobId, jobs, refresh, showToast],
  );

  const value = useMemo(
    () => ({ jobs, activeJobId, enqueue, retry, remove, refresh }),
    [jobs, activeJobId, enqueue, retry, remove, refresh],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploads harus digunakan di dalam UploadProvider.');
  return context;
}
