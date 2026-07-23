import * as tus from 'tus-js-client';
import { getSupabaseProjectRef } from './env';
import { buildTusEndpoint } from './storage-endpoint';
import { baseMimeType, buildTusFingerprint, TUS_CHUNK_SIZE } from './upload-protocol';

export interface TusUploadOptions {
  file: Blob;
  objectPath: string;
  mimeType: string;
  accessToken: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
}

export async function uploadVideoWithTus(options: TusUploadOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };

    const upload = new tus.Upload(options.file, {
      endpoint: buildTusEndpoint(getSupabaseProjectRef()),
      retryDelays: [0, 1000, 3000, 5000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${options.accessToken}`,
      },
      fingerprint: () => Promise.resolve(buildTusFingerprint(options.objectPath, options.file)),
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: 'proof-videos',
        objectName: options.objectPath,
        contentType: baseMimeType(options.mimeType),
        cacheControl: '3600',
      },
      onError: (error) => finish(error),
      onProgress: (uploaded, total) => {
        options.onProgress?.(total > 0 ? Math.round((uploaded / total) * 100) : 0);
      },
      onSuccess: () => finish(),
    });

    const abort = () => {
      void upload.abort(false).finally(() => {
        finish(new DOMException('Upload dibatalkan.', 'AbortError'));
      });
    };

    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (settled) return;
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch((error: Error) => finish(error));
  });
}
