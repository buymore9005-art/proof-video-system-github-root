import { CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { useUploads } from '../providers/upload-provider';
import { Badge, Button, Card, EmptyState } from './ui';

export function UploadDrawer() {
  const { jobs, activeJobId, retry, remove } = useUploads();

  return (
    <Card title={`Antrean Upload (${jobs.length})`} className="upload-drawer">
      {jobs.length === 0 ? (
        <EmptyState title="Antrean kosong" description="Video yang selesai direkam akan muncul di sini." />
      ) : (
        <div className="upload-list">
          {jobs.map((job) => (
            <article key={job.id} className="upload-item">
              <div className="upload-item-heading">
                <div>
                  <strong>{job.orderNumber}</strong>
                  <span>{job.filename}</span>
                </div>
                <Badge
                  tone={
                    job.status === 'failed'
                      ? 'danger'
                      : job.status === 'uploading'
                        ? 'info'
                        : 'warning'
                  }
                >
                  {job.status === 'uploading' ? 'Mengunggah' : job.status === 'failed' ? 'Gagal' : 'Menunggu'}
                </Badge>
              </div>
              <div className="progress-track" aria-label={`Progres ${job.progress}%`}>
                <span style={{ width: `${job.progress}%` }} />
              </div>
              <div className="upload-meta">
                <span>{formatBytes(job.filesize)}</span>
                <span>{job.progress}%</span>
                <span>Percobaan {job.retryCount}</span>
              </div>
              {job.lastError ? <p className="error-text">{job.lastError}</p> : null}
              <div className="inline-actions">
                {job.status === 'failed' ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void retry(job.id)}>
                    <RefreshCw size={15} /> Coba lagi
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={activeJobId === job.id}
                  onClick={() => void remove(job.id)}
                >
                  <Trash2 size={15} /> Hapus lokal
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="muted-row">
        <CloudUpload size={16} /> Video disimpan di perangkat terlebih dahulu, lalu diunggah langsung ke Supabase Storage.
      </p>
    </Card>
  );
}
