import { Activity, CheckCircle2, Clock3, Database, PackageCheck, UploadCloud, Users, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/date';
import { errorMessage, formatBytes, formatDuration } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../providers/toast-provider';
import type { DashboardStats, VideoRecord } from '../types/database';

const emptyStats: DashboardStats = {
  total_videos_today: 0,
  total_orders_today: 0,
  total_duration_ms_today: 0,
  uploads_completed_today: 0,
  uploads_failed: 0,
  active_operators: 0,
  storage_bytes_total: 0,
};

export function DashboardPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState(emptyStats);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [statsResult, videosResult] = await Promise.all([
          supabase.rpc('get_dashboard_stats'),
          supabase.from('videos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
        ]);
        if (statsResult.error) throw statsResult.error;
        if (videosResult.error) throw videosResult.error;
        setStats(statsResult.data?.[0] ?? emptyStats);
        setVideos(videosResult.data ?? []);
      } catch (error) {
        showToast(errorMessage(error), 'error');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showToast]);

  const cards = [
    { label: 'Video hari ini', value: stats.total_videos_today.toLocaleString('id-ID'), icon: Video },
    { label: 'Pesanan hari ini', value: stats.total_orders_today.toLocaleString('id-ID'), icon: PackageCheck },
    { label: 'Total durasi', value: formatDuration(stats.total_duration_ms_today), icon: Clock3 },
    { label: 'Upload berhasil', value: stats.uploads_completed_today.toLocaleString('id-ID'), icon: CheckCircle2 },
    { label: 'Upload gagal', value: stats.uploads_failed.toLocaleString('id-ID'), icon: UploadCloud },
    { label: 'Petugas aktif', value: stats.active_operators.toLocaleString('id-ID'), icon: Users },
    { label: 'Metadata ukuran video', value: formatBytes(stats.storage_bytes_total), icon: Database },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Ringkasan operasional Proof Video System hari ini." actions={<Link className="button button-primary button-md" to="/recording">Mulai Perekaman</Link>} />
      {loading ? <Spinner label="Memuat dashboard" /> : (
        <>
          <div className="stats-grid">
            {cards.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="stat-card">
                <div className="stat-icon"><Icon size={22} /></div>
                <div><span>{label}</span><strong>{value}</strong></div>
              </Card>
            ))}
          </div>
          <Card title="Video Terbaru" action={<Link to="/videos">Lihat semua</Link>}>
            {videos.length === 0 ? <EmptyState title="Belum ada video" description="Data video akan muncul setelah sesi perekaman menghasilkan segmen." /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Pesanan</th><th>Petugas</th><th>Waktu</th><th>Durasi</th><th>Status</th></tr></thead>
                  <tbody>
                    {videos.map((video) => (
                      <tr key={video.id}>
                        <td><strong>{video.order_number}</strong><small>{video.filename}</small></td>
                        <td>{video.operator_name}</td>
                        <td>{formatDateTime(video.start_time)}</td>
                        <td>{formatDuration(video.duration_ms)}</td>
                        <td><span className={`status-dot status-${video.upload_status}`} /> {video.upload_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card className="dashboard-note">
            <Activity size={20} />
            <p>Angka kapasitas menghitung metadata ukuran video yang masih aktif. Kuota Storage sebenarnya tetap mengikuti halaman Usage di Supabase.</p>
          </Card>
        </>
      )}
    </>
  );
}
