import {
  Clipboard,
  Download,
  Eye,
  FileDown,
  FileText,
  Maximize2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  endOfJakartaDate,
  formatDateTime,
  startOfJakartaDate,
} from '../lib/date';
import { errorMessage, formatBytes, formatDuration } from '../lib/format';
import { supabase } from '../lib/supabase';
import { createVideoSignedUrl } from '../lib/video';
import { useAuth } from '../providers/auth-provider';
import { useToast } from '../providers/toast-provider';
import type { ProcessingStatus, UploadStatus, VideoRecord } from '../types/database';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';

const PAGE_SIZE = 20;
const MAX_EXPORT_ROWS = 5000;

interface VideoFilters {
  search: string;
  orderNumber: string;
  barcode: string;
  operator: string;
  uploadStatus: UploadStatus | '';
  processingStatus: ProcessingStatus | '';
  dateFrom: string;
  dateTo: string;
  durationMinSeconds: string;
  durationMaxSeconds: string;
  sizeMinMb: string;
  sizeMaxMb: string;
}

const EMPTY_FILTERS: VideoFilters = {
  search: '',
  orderNumber: '',
  barcode: '',
  operator: '',
  uploadStatus: '',
  processingStatus: '',
  dateFrom: '',
  dateTo: '',
  durationMinSeconds: '',
  durationMaxSeconds: '',
  sizeMinMb: '',
  sizeMaxMb: '',
};

function safeSearch(value: string): string {
  return value.replace(/[,%()]/g, ' ').trim().slice(0, 100);
}

function jakartaDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function mondayOfCurrentJakartaWeek(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  return jakartaDate(-daysSinceMonday);
}

function applyFilters(query: any, filters: VideoFilters): any {
  let result = query;
  const search = safeSearch(filters.search);
  if (search) {
    result = result.or(
      `order_number.ilike.%${search}%,barcode.ilike.%${search}%,filename.ilike.%${search}%,operator_name.ilike.%${search}%`,
    );
  }
  if (filters.orderNumber.trim()) {
    result = result.ilike('order_number', `%${safeSearch(filters.orderNumber)}%`);
  }
  if (filters.barcode.trim()) result = result.ilike('barcode', `%${safeSearch(filters.barcode)}%`);
  if (filters.operator.trim()) {
    result = result.ilike('operator_name', `%${safeSearch(filters.operator)}%`);
  }
  if (filters.uploadStatus) result = result.eq('upload_status', filters.uploadStatus);
  if (filters.processingStatus) {
    result = result.eq('processing_status', filters.processingStatus);
  }
  if (filters.dateFrom) result = result.gte('start_time', startOfJakartaDate(filters.dateFrom));
  if (filters.dateTo) result = result.lte('start_time', endOfJakartaDate(filters.dateTo));

  const durationMin = Number(filters.durationMinSeconds);
  const durationMax = Number(filters.durationMaxSeconds);
  const sizeMin = Number(filters.sizeMinMb);
  const sizeMax = Number(filters.sizeMaxMb);
  if (filters.durationMinSeconds && Number.isFinite(durationMin)) {
    result = result.gte('duration_ms', Math.max(0, durationMin) * 1000);
  }
  if (filters.durationMaxSeconds && Number.isFinite(durationMax)) {
    result = result.lte('duration_ms', Math.max(0, durationMax) * 1000);
  }
  if (filters.sizeMinMb && Number.isFinite(sizeMin)) {
    result = result.gte('filesize', Math.max(0, sizeMin) * 1024 * 1024);
  }
  if (filters.sizeMaxMb && Number.isFinite(sizeMax)) {
    result = result.lte('filesize', Math.max(0, sizeMax) * 1024 * 1024);
  }
  return result;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsvFile(videos: VideoRecord[]): void {
  const headers = [
    'order_number',
    'barcode',
    'operator',
    'session_id',
    'start_time',
    'end_time',
    'duration_ms',
    'filename',
    'filesize',
    'upload_status',
    'processing_status',
    'storage_path',
    'created_at',
  ];
  const rows = videos.map((video) => [
    video.order_number,
    video.barcode,
    video.operator_name,
    video.session_id,
    video.start_time,
    video.end_time,
    video.duration_ms,
    video.filename,
    video.filesize,
    video.upload_status,
    video.processing_status,
    video.storage_path,
    video.created_at,
  ]);
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `proof-video-${jakartaDate()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VideosPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const previewElementRef = useRef<HTMLVideoElement | null>(null);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<VideoFilters>(EMPTY_FILTERS);
  const [preview, setPreview] = useState<{ video: VideoRecord; url: string } | null>(null);
  const [details, setDetails] = useState<VideoRecord | null>(null);

  const updateFilter = <K extends keyof VideoFilters>(key: K, value: VideoFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('videos')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('start_time', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      query = applyFilters(query, filters);

      const { data, error, count: total } = await query;
      if (error) throw error;
      setVideos(data ?? []);
      setCount(total ?? 0);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const setQuickRange = (range: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = jakartaDate();
    if (range === 'today') {
      setFilters((current) => ({ ...current, dateFrom: today, dateTo: today }));
    } else if (range === 'yesterday') {
      const yesterday = jakartaDate(-1);
      setFilters((current) => ({ ...current, dateFrom: yesterday, dateTo: yesterday }));
    } else if (range === 'week') {
      setFilters((current) => ({ ...current, dateFrom: mondayOfCurrentJakartaWeek(), dateTo: today }));
    } else {
      setFilters((current) => ({ ...current, dateFrom: `${today.slice(0, 7)}-01`, dateTo: today }));
    }
    setPage(1);
  };

  const openPreview = async (video: VideoRecord) => {
    try {
      setPreview({ video, url: await createVideoSignedUrl(video) });
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const download = async (video: VideoRecord) => {
    try {
      const url = await createVideoSignedUrl(video, true);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const copyLink = async (video: VideoRecord) => {
    try {
      const url = await createVideoSignedUrl(video);
      await navigator.clipboard.writeText(url);
      showToast('Tautan sementara disalin. Tautan berlaku selama satu jam.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const deleteVideo = async (video: VideoRecord) => {
    if (!window.confirm(`Hapus video ${video.order_number}? File Storage akan dihapus permanen.`)) return;
    try {
      await apiRequest<{ deleted: boolean }>('/api/videos/delete', {
        method: 'POST',
        body: JSON.stringify({ videoId: video.id }),
      });
      showToast('Video dan metadata berhasil dihapus.', 'success');
      setDetails(null);
      setPreview(null);
      await load();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('videos')
        .select('*')
        .is('deleted_at', null)
        .order('start_time', { ascending: false })
        .limit(MAX_EXPORT_ROWS);
      query = applyFilters(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      downloadCsvFile(data ?? []);
      showToast(`${data?.length ?? 0} baris diekspor ke CSV.`, 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setExporting(false);
    }
  };

  const openFullscreen = async () => {
    try {
      await previewElementRef.current?.requestFullscreen();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const rangeLabel = useMemo(() => {
    if (count === 0) return '0 data';
    const first = (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(page * PAGE_SIZE, count);
    return `${first}-${last} dari ${count}`;
  }, [count, page]);

  return (
    <>
      <PageHeader
        title="Data Video"
        description="Cari, preview, unduh, ekspor, dan kelola bukti video packing."
        actions={
          <div className="inline-actions">
            {isAdmin ? (
              <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportCsv()}>
                <FileDown size={17} /> {exporting ? 'Mengekspor...' : 'Ekspor CSV'}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => void load()}>
              <RefreshCw size={17} /> Muat ulang
            </Button>
          </div>
        }
      />

      <Card title="Filter">
        <div className="quick-filter-row">
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickRange('today')}>Hari ini</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickRange('yesterday')}>Kemarin</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickRange('week')}>Minggu ini</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickRange('month')}>Bulan ini</Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>Reset semua</Button>
        </div>
        <div className="filter-grid filter-grid-wide">
          <Field label="Pencarian cepat">
            <div className="input-with-icon">
              <Search size={17} />
              <Input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Pesanan, barcode, file, petugas" />
            </div>
          </Field>
          <Field label="Nomor pesanan"><Input value={filters.orderNumber} onChange={(event) => updateFilter('orderNumber', event.target.value)} /></Field>
          <Field label="Barcode"><Input value={filters.barcode} onChange={(event) => updateFilter('barcode', event.target.value)} /></Field>
          <Field label="Nama petugas"><Input value={filters.operator} onChange={(event) => updateFilter('operator', event.target.value)} /></Field>
          <Field label="Status upload">
            <Select value={filters.uploadStatus} onChange={(event) => updateFilter('uploadStatus', event.target.value as UploadStatus | '')}>
              <option value="">Semua</option><option value="queued">Queued</option><option value="uploading">Uploading</option><option value="completed">Completed</option><option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Status pemrosesan">
            <Select value={filters.processingStatus} onChange={(event) => updateFilter('processingStatus', event.target.value as ProcessingStatus | '')}>
              <option value="">Semua</option><option value="ready">Ready</option><option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Tanggal mulai"><Input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></Field>
          <Field label="Tanggal selesai"><Input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></Field>
          <Field label="Durasi minimum (detik)"><Input type="number" min="0" value={filters.durationMinSeconds} onChange={(event) => updateFilter('durationMinSeconds', event.target.value)} /></Field>
          <Field label="Durasi maksimum (detik)"><Input type="number" min="0" value={filters.durationMaxSeconds} onChange={(event) => updateFilter('durationMaxSeconds', event.target.value)} /></Field>
          <Field label="Ukuran minimum (MB)"><Input type="number" min="0" step="0.1" value={filters.sizeMinMb} onChange={(event) => updateFilter('sizeMinMb', event.target.value)} /></Field>
          <Field label="Ukuran maksimum (MB)"><Input type="number" min="0" step="0.1" value={filters.sizeMaxMb} onChange={(event) => updateFilter('sizeMaxMb', event.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Daftar Video" action={<span className="muted-text">{rangeLabel}</span>}>
        {loading ? (
          <Spinner label="Memuat video" />
        ) : videos.length === 0 ? (
          <EmptyState title="Video tidak ditemukan" description="Ubah filter atau lakukan perekaman baru." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pesanan</th><th>Petugas</th><th>Mulai</th><th>Durasi</th><th>Ukuran</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td><strong>{video.order_number}</strong><small>{video.filename}</small></td>
                    <td>{video.operator_name}</td>
                    <td>{formatDateTime(video.start_time)}</td>
                    <td>{formatDuration(video.duration_ms)}</td>
                    <td>{formatBytes(video.filesize)}</td>
                    <td><Badge tone={video.upload_status === 'completed' ? 'success' : video.upload_status === 'failed' ? 'danger' : 'warning'}>{video.upload_status}</Badge></td>
                    <td>
                      <div className="table-actions">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDetails(video)} title="Detail"><FileText size={16} /></Button>
                        <Button type="button" variant="ghost" size="sm" disabled={video.upload_status !== 'completed'} onClick={() => void openPreview(video)} title="Preview"><Eye size={16} /></Button>
                        <Button type="button" variant="ghost" size="sm" disabled={video.upload_status !== 'completed'} onClick={() => void download(video)} title="Download"><Download size={16} /></Button>
                        <Button type="button" variant="ghost" size="sm" disabled={video.upload_status !== 'completed'} onClick={() => void copyLink(video)} title="Salin tautan"><Clipboard size={16} /></Button>
                        {isAdmin ? <Button type="button" variant="ghost" size="sm" onClick={() => void deleteVideo(video)} title="Hapus"><Trash2 size={16} /></Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button>
          <span>Halaman {page} / {totalPages}</span>
          <Button type="button" variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button>
        </div>
      </Card>

      <Modal open={Boolean(preview)} title={preview ? `Preview ${preview.video.order_number}` : 'Preview'} onClose={() => setPreview(null)}>
        {preview ? (
          <div className="preview-stack">
            <video ref={previewElementRef} className="video-preview" src={preview.url} controls autoPlay playsInline />
            <div className="inline-actions">
              <Button type="button" variant="secondary" onClick={() => void openFullscreen()}><Maximize2 size={16} /> Fullscreen</Button>
              <Button type="button" variant="secondary" onClick={() => void download(preview.video)}><Download size={16} /> Download</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(details)} title={details ? `Detail ${details.order_number}` : 'Detail Video'} onClose={() => setDetails(null)}>
        {details ? (
          <dl className="detail-list detail-list-modal">
            <div><dt>Nomor pesanan</dt><dd>{details.order_number}</dd></div>
            <div><dt>Barcode</dt><dd>{details.barcode}</dd></div>
            <div><dt>Petugas</dt><dd>{details.operator_name}</dd></div>
            <div><dt>Sesi</dt><dd><code>{details.session_id}</code></dd></div>
            <div><dt>Mulai</dt><dd>{formatDateTime(details.start_time)}</dd></div>
            <div><dt>Selesai</dt><dd>{formatDateTime(details.end_time)}</dd></div>
            <div><dt>Durasi</dt><dd>{formatDuration(details.duration_ms)}</dd></div>
            <div><dt>Nama file</dt><dd>{details.filename}</dd></div>
            <div><dt>Ukuran</dt><dd>{formatBytes(details.filesize)}</dd></div>
            <div><dt>MIME</dt><dd>{details.mime_type}</dd></div>
            <div><dt>Status upload</dt><dd>{details.upload_status} ({details.upload_progress}%)</dd></div>
            <div><dt>Status pemrosesan</dt><dd>{details.processing_status}</dd></div>
            <div><dt>Storage path</dt><dd><code>{details.storage_path}</code></dd></div>
            <div><dt>Dibuat</dt><dd>{formatDateTime(details.created_at)}</dd></div>
            {details.last_error ? <div><dt>Error terakhir</dt><dd className="error-text">{details.last_error}</dd></div> : null}
          </dl>
        ) : null}
      </Modal>
    </>
  );
}
